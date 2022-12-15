var docsifyPlugins = [
  function (hook, vm) {
    hook.ready(function () {
      mermaid.initialize({ startOnLoad: false });
    });
    hook.doneEach(function () {
      mermaid.init(undefined, ".mermaid");
    });
  },
  function (hook, vm) {
    hook.beforeEach(function (content) {
      // 每次开始解析 Markdown 内容时调用
      // 隐藏掉头部的 yaml 标题配置
      var contentArr = content.split("---\n");
      var newContent = contentArr[contentArr.length - 1];
      return newContent;
    });
  },
];
