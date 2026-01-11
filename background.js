
// Chrome 扩展 Service Worker
// 负责处理点击图标打开侧边栏 (Side Panel) 的逻辑

// 监听图标点击事件 (仅在 manifest 中移除了 action.default_popup 后生效)
chrome.action.onClicked.addListener((tab) => {
  // 打开侧边栏
  chrome.sidePanel.open({ windowId: tab.windowId });
});

// 设置侧边栏行为：点击图标时打开
// 注意：这需要 Chrome 116+ 版本支持，旧版本会依赖上面的 onClicked
if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error(error));
}
