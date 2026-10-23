import { VirtualList, type ItemData } from './virtualList'

const viewport = document.getElementById('viewport') as HTMLElement
const phantom = document.getElementById('phantom') as HTMLElement
const contentBox = document.getElementById('content-box') as HTMLElement

const statDomCount = document.getElementById('stat-dom-count') as HTMLElement
const statRange = document.getElementById('stat-range') as HTMLElement
const statPhantomHeight = document.getElementById('stat-phantom-height') as HTMLElement

// 1. 生成 100,000 条长短极度不规则的不定高数据
const SENTENCES = [
  '短句说明：系统已就绪。',
  '中长段落：这是一个包含较多文字的测试数据项，用来检验浏览器在处理多行文本换行以及盒模型计算时的稳定性。',
  '极长文本测试：虚拟列表的最核心难点是不定高场景。当每条记录根据内容动态折行扩展时，高度无法用固定的 index * height 进行直接定位。我们必须通过动态建立前缀和位置数组并在渲染后利用 ResizeObserver 实时修正真实高度，同时依赖二分查找以 O(log N) 的极速定位起始项，结合 DOM 节点对象池实现完全零垃圾回收的丝滑滚动体验。',
  '常规提示：网络已连接，数据缓存命中。',
  '带代码片段的内容：`const buffer = new SharedArrayBuffer(1024); Atomics.wait(int32, 0, 0);` 模拟技术日志与异常追踪堆栈。',
]

console.time('generate 100k data')
const totalItems = 100_000
const mockData: ItemData[] = new Array(totalItems)

for (let i = 0; i < totalItems; i++) {
  // 随机挑选不同长度的文本模拟动态高度
  const randIndex = (i * 17 + 7) % SENTENCES.length
  mockData[i] = {
    id: i,
    title: `Data Record [Chunk-${Math.floor(i / 1000)}]`,
    content: SENTENCES[randIndex],
  }
}
console.timeEnd('generate 100k data')

// 2. 挂载虚拟滚动容器
new VirtualList({
  viewport,
  phantom,
  contentBox,
  data: mockData,
  estimatedHeight: 70, // 初始预估高度 70px
  bufferCount: 6, // 上下各缓冲 6 项
  onMetricsUpdate: (domCount, range, totalHeight) => {
    statDomCount.textContent = `${domCount} 个`
    statRange.textContent = `[${range[0]}, ${range[1]}]`
    statPhantomHeight.textContent = `${Math.round(totalHeight).toLocaleString()} px`
  },
})
