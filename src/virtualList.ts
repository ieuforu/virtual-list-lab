export interface ItemData {
  id: number
  title: string
  content: string
}

export interface ItemPosition {
  index: number
  top: number
  bottom: number
  height: number
}

export interface VirtualListOptions {
  viewport: HTMLElement
  phantom: HTMLElement
  contentBox: HTMLElement
  data: ItemData[]
  estimatedHeight: number
  bufferCount?: number
  onMetricsUpdate?: (domCount: number, range: [number, number], totalHeight: number) => void
}

export class VirtualList {
  private viewport: HTMLElement
  private phantom: HTMLElement
  private contentBox: HTMLElement
  private data: ItemData[]
  private estimatedHeight: number
  private bufferCount: number

  // 位置与绝对偏移缓存 (前缀和数组)
  private positions: ItemPosition[] = []
  // DOM 节点对象池 (Object Pool)
  private domPool: HTMLElement[] = []
  private resizeObserver: ResizeObserver

  private onMetricsUpdate?: (domCount: number, range: [number, number], totalHeight: number) => void
  private lastRenderedRange: [number, number] = [-1, -1]

  constructor(options: VirtualListOptions) {
    this.viewport = options.viewport
    this.phantom = options.phantom
    this.contentBox = options.contentBox
    this.data = options.data
    this.estimatedHeight = options.estimatedHeight
    this.bufferCount = options.bufferCount ?? 5
    this.onMetricsUpdate = options.onMetricsUpdate

    this.initPositions()
    this.resizeObserver = new ResizeObserver((entries) => {
      this.handleResize(entries)
    })

    this.initDomPool()
    this.bindScroll()
    this.render()
  }

  // 1. 初始化前缀和位置信息（以预估高度打底）
  private initPositions() {
    this.positions = new Array(this.data.length)
    for (let i = 0; i < this.data.length; i++) {
      this.positions[i] = {
        index: i,
        top: i * this.estimatedHeight,
        bottom: (i + 1) * this.estimatedHeight,
        height: this.estimatedHeight,
      }
    }
    this.updatePhantomHeight()
  }

  private updatePhantomHeight() {
    const totalHeight = this.positions[this.positions.length - 1]?.bottom || 0
    this.phantom.style.height = `${totalHeight}px`
    return totalHeight
  }

  // 2. 初始化 DOM 节点对象池：只创建屏幕能容纳的最大数量节点
  private initDomPool() {
    const viewportHeight = this.viewport.clientHeight || 520
    // 屏幕容量 + 上下双缓冲数量
    const poolSize = Math.ceil(viewportHeight / this.estimatedHeight) + this.bufferCount * 2

    this.contentBox.innerHTML = ''
    this.domPool = []

    for (let i = 0; i < poolSize; i++) {
      const el = document.createElement('div')
      el.className = 'list-item'
      el.style.display = 'none'
      el.innerHTML = `
        <div class="list-item-header">
          <span class="item-title"></span>
          <span class="item-size"></span>
        </div>
        <div class="list-item-desc"></div>
      `
      this.contentBox.appendChild(el)
      this.domPool.push(el)
      this.resizeObserver.observe(el)
    }
  }

  // 3. O(log N) 二分查找起始项（寻找第一个 bottom > scrollTop 的元素）
  private findStartIndex(scrollTop: number): number {
    let low = 0
    let high = this.positions.length - 1

    while (low <= high) {
      const mid = (low + high) >>> 1
      const midBottom = this.positions[mid].bottom

      if (midBottom === scrollTop) {
        return mid + 1
      } else if (midBottom < scrollTop) {
        low = mid + 1
      } else {
        high = mid - 1
      }
    }
    return low
  }

  // 4. 监听真实尺寸渲染变化，修正前缀和
  private handleResize(entries: ResizeObserverEntry[]) {
    let hasChanged = false

    for (const entry of entries) {
      const target = entry.target as HTMLElement
      const indexStr = target.dataset.index
      if (indexStr === undefined) continue

      const index = parseInt(indexStr, 10)
      const realHeight = entry.borderBoxSize?.[0]?.blockSize ?? target.offsetHeight

      const pos = this.positions[index]
      if (pos && pos.height !== realHeight) {
        const dVal = realHeight - pos.height
        pos.height = realHeight
        pos.bottom += dVal

        // 级联向后更新所有受影响节点的前缀和偏移量
        for (let j = index + 1; j < this.positions.length; j++) {
          this.positions[j].top += dVal
          this.positions[j].bottom += dVal
        }
        hasChanged = true
      }
    }

    if (hasChanged) {
      const totalH = this.updatePhantomHeight()
      if (this.onMetricsUpdate) {
        this.onMetricsUpdate(this.domPool.length, this.lastRenderedRange, totalH)
      }
    }
  }

  // 5. 核心渲染工作循环：完全复用池内节点，不触发 DOM 增删
  private render() {
    const scrollTop = this.viewport.scrollTop
    const viewportHeight = this.viewport.clientHeight || 520

    let startIndex = this.findStartIndex(scrollTop)
    // 加入上方缓冲区
    startIndex = Math.max(0, startIndex - this.bufferCount)

    // 寻找可视区结束项并加上下方缓冲区
    let endIndex = startIndex
    const bottomLimit = scrollTop + viewportHeight

    while (endIndex < this.positions.length && this.positions[endIndex].top < bottomLimit) {
      endIndex++
    }
    endIndex = Math.min(this.data.length - 1, endIndex + this.bufferCount)

    this.lastRenderedRange = [startIndex, endIndex]

    const renderCount = endIndex - startIndex + 1

    // 遍历 DOM 节点池复用并挂载数据
    for (let i = 0; i < this.domPool.length; i++) {
      const dom = this.domPool[i]
      const dataIndex = startIndex + i

      if (i < renderCount && dataIndex < this.data.length) {
        const item = this.data[dataIndex]
        const pos = this.positions[dataIndex]

        // 建立真实数据下标索引映射
        dom.dataset.index = dataIndex.toString()

        // 仅修改 transform 与 textContent，绝不调用 appendChild / removeChild
        dom.style.transform = `translate3d(0, ${pos.top}px, 0)`
        dom.style.display = 'flex'

        const titleEl = dom.querySelector('.item-title') as HTMLElement
        const sizeEl = dom.querySelector('.item-size') as HTMLElement
        const descEl = dom.querySelector('.list-item-desc') as HTMLElement

        titleEl.textContent = `#${item.id} ${item.title}`
        sizeEl.textContent = `高度: ${Math.round(pos.height)}px`
        descEl.textContent = item.content
      } else {
        dom.style.display = 'none'
        delete dom.dataset.index
      }
    }

    if (this.onMetricsUpdate) {
      const totalH = this.positions[this.positions.length - 1]?.bottom || 0
      this.onMetricsUpdate(this.domPool.length, [startIndex, endIndex], totalH)
    }
  }

  private bindScroll() {
    let ticking = false
    this.viewport.addEventListener(
      'scroll',
      () => {
        if (!ticking) {
          requestAnimationFrame(() => {
            this.render()
            ticking = false
          })
          ticking = true
        }
      },
      { passive: true },
    )
  }
}
