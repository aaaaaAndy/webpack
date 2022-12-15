> 开始编译：用上一步获取的参数初始化`Compiler`对象，加载所有配置的插件，并执行`Compiler`对象实例的`run`方法开始编译；

该过程不止在一个 npm 包中完成，它横跨 webpack-cli 和 webpack 包。

## webpack-cli/createCompiler

该函数位于 webpack-cli 中，文件路径为： `webpack-cli/src/webpack-cli.ts`📌。

该函数的核心在于 try 内部的 `compiler = this.webpack()`，在该函数之前曾执行过 `this.webpack = await this.loadWebpack();`，所以这里 `this.webpack` 就相当于 webpack 包的入口方法，这里是引用了 webpack 包，通过函数调用的方式将参数传给 webpack 从而来开启 webpack 打包进程。

在 `try...catch` 方法之前的 `loadConfig` 和 `buildConfig` 就是我们在 **初始化参数** 这一步骤中的处理函数，由执行顺序可知道这里执行完参数的处理后就调用了 webpack 方法，进入了 **开始编译** 过程。

调用 `this.webpack()` 方法时传入了两个参数，第一个是 `config.options`，第二个是回调函数。

```javascript
/**
   * 调用 webpack 方法，真是来回调
   */
async createCompiler(
  options: Partial<WebpackDevServerOptions>,
  callback?: Callback<[Error | undefined, WebpackCLIStats | undefined]>,
  ): Promise<WebpackCompiler> {

  let config = await this.loadConfig(options);
  config = await this.buildConfig(config, options);

  let compiler: WebpackCompiler;
  try {
    // 调用 webpack 函数
    // 后续流程就要去 webpack 包看源码了
    compiler = this.webpack(
      config.options as WebpackConfiguration,
      callback
      ? (error, stats) => {
        callback(error, stats);
      }
      : callback,
      );
      // @ts-expect-error error type assertion
  } catch (error: Error) {
    process.exit(2);
  }

  if (compiler && (compiler as WebpackV4Compiler).compiler) {
    compiler = (compiler as WebpackV4Compiler).compiler;
  }

  return compiler;
}
```

最终传入 `this.webpack()` 的参数如下所示：

![config](https://raw.githubusercontent.com/aaaaaAndy/picture/main/images/20221215162754.png)

## webpack/webpack 方法

`webpack()` 是 webpack 包的入口函数，主要功能如下：

1. 校验传入的配置参数 options，具体调用 [ajv](https://www.npmjs.com/package/ajv) 包实现；
2. 判断传入的 options 配置是否是数组，如果是数组，实例化 `MultiCompiler`，如果不是数组，实例化 `Compiler`，其中实例化 `MultiCompiler` 传参还是递归调用了 `webpack()` 函数；
3. 实例化 `NodeEnvironmentPlugin` 插件，应用 Node 的文件系统到 `compiler` 实例上，方便后续的查找和读取；
4. 遍历 `options.plugins`，执行所有插件，如果是函数类型插件，借用函数的 `call` 方法执行函数，传入 `compiler` 对象，如果是类插件，调用实例的 `apply` 方法，传入 `compiler` 对象；
5. 调用 `environment` 和 `afterEnvironment` 两个钩子；
6. 判断参数中是否传入了回调函数 `callback`，如果没有，直接返回刚才实例化的 `compiler` 对象；
7. 判断是否为 watch 模式，如果是，调用 `compiler.watch()` 方法，否则调用 `compiler.run()` 方法；

```javascript
/**
 * 对外暴露的webpack
 * @param {WebpackOptions} options options webpack所需参数
 * @param {function(Error=, Stats=): void=} callback callback 回调
 * @returns {Compiler | MultiCompiler} the compiler object
 */
const webpack = (options, callback) => {
  // options数据格式校验，JSON Schema
  const webpackOptionsValidationErrors = validateSchema(
    webpackOptionsSchema,
    options
  );

  let compiler;
  if (Array.isArray(options)) {
    // 有多个options配置文件的情况，一般不存在这种情况
    compiler = new MultiCompiler(
      Array.from(options).map((options) => webpack(options))
    );
  } else if (typeof options === "object") {
    // 正常流程，options是个对象
    // 将options与默认的options进行融合
    options = new WebpackOptionsDefaulter().process(options);

    // 初始化Compiler实例
    compiler = new Compiler(options.context);
    compiler.options = options;

    // 磁盘输入输出文件操作
    // 应用Node的文件系统到compiler，方便后续的查找和读取
    new NodeEnvironmentPlugin({
      infrastructureLogging: options.infrastructureLogging,
    }).apply(compiler);

    // 注册所有自定义插件
    if (options.plugins && Array.isArray(options.plugins)) {
      // 添加一系列插件，依次调用插件的apply方法，若为函数则直接调用，同时给插件传入compiler实例
      // 同时将compiler对象传入，方便插件调用本次构建提供的webpack API并监听后续所有事件hook
      for (const plugin of options.plugins) {
        if (typeof plugin === "function") {
          plugin.call(compiler, compiler);
        } else {
          plugin.apply(compiler);
        }
      }
    }

    // 调用 environment 和 afterEnvironment 两个钩子
    compiler.hooks.environment.call();
    compiler.hooks.afterEnvironment.call();

    // 调用 WebpackOptionsApply 类处理 options，同时挂载一些默认钩子
    compiler.options = new WebpackOptionsApply().process(options, compiler);
  } else {
    throw new Error("Invalid argument: options");
  }

  // 如果传入了callback，则webpack自启动
  // callback一般都是处理错误信息
  if (callback) {
    if (typeof callback !== "function") {
      throw new Error("Invalid argument: callback");
    }

    // 如果是是watch模式，则开始watch线程
    if (
      options.watch === true ||
      (Array.isArray(options) && options.some((o) => o.watch))
    ) {
      const watchOptions = Array.isArray(options)
        ? options.map((o) => o.watchOptions || {})
        : options.watchOptions || {};
      return compiler.watch(watchOptions, callback);
    }

    // 如果传入了 callback，且不是 watch 模式，则调用run方法开始编译
    compiler.run(callback);
  }

  return compiler;
};
```

在执行 `compiler.run()` 方法之前，生成的 `compiler` 对象如下图所示：

![compiler](https://raw.githubusercontent.com/aaaaaAndy/picture/main/images/20221215174551.png)

## WebpackOptionsApply

说是处理 `options`，其实这个类最大的功能是在对应的钩子上挂上默认的处理方法，webpack4 是基于 `tabable` 运行的，所以看源代码并不会像其他库一样能按函数调用顺序一路顺下去，它之所以优秀就是将所有的处理逻辑都抽象成了插件，以钩子的形式挂载到不同的生命周期上。

```javascript
class WebpackOptionsApply extends OptionsApply {
  constructor() {
    super();
  }

  /**
   * @param {WebpackOptions} options options webpack配置选项
   * @param {Compiler} compiler compiler object
   * @returns {WebpackOptions} options object
   */
  process(options, compiler) {
    switch (options.target) {
      case "web":
        JsonpTemplatePlugin = require("./web/JsonpTemplatePlugin");
        FetchCompileWasmTemplatePlugin = require("./web/FetchCompileWasmTemplatePlugin");
        NodeSourcePlugin = require("./node/NodeSourcePlugin");
        new JsonpTemplatePlugin().apply(compiler);
        new FetchCompileWasmTemplatePlugin({
          mangleImports: options.optimization.mangleWasmImports,
        }).apply(compiler);
        new FunctionModulePlugin().apply(compiler);
        new NodeSourcePlugin(options.node).apply(compiler);
        new LoaderTargetPlugin(options.target).apply(compiler);
        break;
    }

    new JavascriptModulesPlugin().apply(compiler);
    new JsonModulesPlugin().apply(compiler);
    new WebAssemblyModulesPlugin({
      mangleImports: options.optimization.mangleWasmImports,
    }).apply(compiler);

    // 这里订阅了make钩子，开始加载文件
    new EntryOptionPlugin().apply(compiler);

    // 执行entryOptions钩子上的方法，该钩子的订阅在上面一行代码中
    compiler.hooks.entryOption.call(options.context, options.entry);

    new CompatibilityPlugin().apply(compiler);
    new HarmonyModulesPlugin(options.module).apply(compiler);
    if (options.amd !== false) {
      const AMDPlugin = require("./dependencies/AMDPlugin");
      const RequireJsStuffPlugin = require("./RequireJsStuffPlugin");
      new AMDPlugin(options.module, options.amd || {}).apply(compiler);
      new RequireJsStuffPlugin().apply(compiler);
    }
    new CommonJsPlugin(options.module).apply(compiler);
    new LoaderPlugin().apply(compiler);
    if (options.node !== false) {
      const NodeStuffPlugin = require("./NodeStuffPlugin");
      new NodeStuffPlugin(options.node).apply(compiler);
    }
    new CommonJsStuffPlugin().apply(compiler);
    new APIPlugin().apply(compiler);
    new ConstPlugin().apply(compiler);
    new UseStrictPlugin().apply(compiler);
    new RequireIncludePlugin().apply(compiler);
    new RequireEnsurePlugin().apply(compiler);
    new RequireContextPlugin(
      options.resolve.modules,
      options.resolve.extensions,
      options.resolve.mainFiles
    ).apply(compiler);
    new ImportPlugin(options.module).apply(compiler);
    new SystemPlugin(options.module).apply(compiler);
  }
}
```
