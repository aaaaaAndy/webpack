> 确定入口：根据配置中的`entry`找出所有的入口文件。

在 **开始编译** 一步中，会根据情况分别初始化 `MultiCompiler` 或 `Compiler`，但在函数最后都是调用 `compiler.run()` 方法。

## MultiCompiler

`MultiCompiler` 最终还是基于 `Compiler`，它只是以列表形式维护多个 `compiler` 对象，最终还是要回归到 `Compiler` 中去。

### webpack 初始化 MultiCompiler

在 `webpack()` 方法中，会判断参数 `options`是否为数组。如果是数组，就实例化 `MultiCompiler`，其中实例化传入的参数却是遍历 `options` 后对每一项配置调用 `webpack()` 方法生成的 `compiler` 列表，类似 `[compiler1, compiler2, compiler3]`。

```javascript
const webpack = (options, callback) => {
  let compiler;

  // 当 options 是个数组时，遍历调用 webpack 函数生成 compiler 对象
  if (Array.isArray(options)) {
    compiler = new MultiCompiler(
      Array.from(options).map((options) => webpack(options))
    );
  }

  return compiler;
};
```

### MultiCompiler.constructor

在 `MultiCompiler` 类的构造函数中用 `this.compilers` 接收传入的 `compiler` 数组。

```javascript
class MultiCompiler extends Tapable {
  constructor(props) {
    super(props);

    // 接收传入的 compiler 列表
    this.compilers = compilers;
  }
}
```

### MultiCompiler.run

当调用 `MultiCompiler` 实例的 `run()` 方法时，其实就是遍历 `this.compilers`，然后调用每一个 `compiler` 对象的 `run()` 方法。

```javascript
class MultiCompiler extends Tapable {
  run(callback) {
    this.runWithDependencies(
      // 这里传入了 this.compilers 数组
      this.compilers,

      // 这里回调函数参数中的 compiler 就是刚才过滤后的 this.compilers 中的 compiler 对象
      (compiler, callback) => {
        const compilerIdx = this.compilers.indexOf(compiler);
        // 这里调用每一个 compiler 对象的 run 方法
        compiler.run((err, stats) => {
          if (err) {
            return callback(err);
          }
          allStats[compilerIdx] = stats;
          callback();
        });
      },

      // 错误处理函数
      (err) => {
        if (err) {
          return finalCallback(err);
        }
        finalCallback(null, new MultiStats(allStats));
      }
    );
  }
}
```

### MultiCompiler.runWithDependencies

该方法只是遍历一下 `this.compilers`，过滤出依赖齐全的 `compiler` 对象，然后调用 `fn` 函数对这些 `compiler` 对象分别处理。

```javascript
class MultiCompiler extends Tapable {
  /**
   * 遍历 this.compilers 列表，分别处理每个 compiler 对象
   * @param  {[type]}   compilers 传入this.compilers，实则为 compiler 数组
   * @param  {Function} fn        compiler处理函数
   * @param  {Function} callback  错误处理回调
   */
  runWithDependencies(compilers, fn, callback) {
    // 这里复制了一次
    let remainingCompilers = compilers;

    const getReadyCompilers = () => {
      // 依赖齐全的 compiler
      let readyCompilers = [];

      // 这里又复制了一次
      let list = remainingCompilers;
      // 清空 remainingCompilers，以便可以再次使用
      remainingCompilers = [];

      // 这里的 for 循环处理逻辑是判断每个 compiler 对象的依赖是否齐全，分别归类到不同的列表中
      for (const c of list) {
        const ready =
          !c.dependencies || c.dependencies.every(isDependencyFulfilled);
        if (ready) {
          readyCompilers.push(c);
        } else {
          remainingCompilers.push(c);
        }
      }

      // 返回依赖齐全的 compiler 列表，可以继续执行
      return readyCompilers;
    };

    const runCompilers = (callback) => {
      // asyncLib 引入的是 neo-async 包，其 map 方法第一个参数是 readyCompilers 列表，第二个参数是处理 readyCompilers 的处理函数
      // 这里会对 readyCompilers 遍历，然后针对每一个 compiler 调用处理函数进行处理
      asyncLib.map(
        // 该函数返回依赖齐全，也就是可以继续执行的 compiler 列表
        getReadyCompilers(),

        // 调用 fn 方法
        (compiler, callback) => {
          fn(compiler, (err) => {
            if (err) return callback(err);
            fulfilledNames.add(compiler.name);
            runCompilers(callback);
          });
        },
        callback
      );
    };

    runCompilers(callback);
  }
}
```

## Compiler

### Compiler.run

不管是实例化 `MultiCompiler` 还是 `Compiler`，最终都是以调用 `compiler.run()` 开始执行编译。

1. 判断当前 `compiler` 对象是否正在编译，如果正在编译，直接调用 `callback()` 返回错误信息；
2. 定义 `finalCallback` 函数，`onCompiled` 函数，打点记录开始编译时间，置反标志位 `this.running = true`;
3. 调用 `beforeRun` 钩子；
4. 调用 `run` 钩子；
5. 调用 `readRecords()` 函数从本地读取之前记录的一些数据，这些数据用于存储多次构建过程中的 module 标识；
6. 调用 `compile()` 函数开始编译

```javascript
class Compiler extends Tapable {
  run(callback) {
    // 如果当前正在运行，则执行callback方法
    if (this.running) return callback(new ConcurrentCompilationError());

    // 最终结束时的callback
    const finalCallback = (err, stats) => {};

    const startTime = Date.now();

    // 置反this.running标志位
    this.running = true;

    // 执行完毕回调
    const onCompiled = (err, compilation) => {};

    // 调用 beforeRun 钩子上的方法
    this.hooks.beforeRun.callAsync(this, (err) => {
      if (err) return finalCallback(err);

      // 调用 run 钩子上的方法
      this.hooks.run.callAsync(this, (err) => {
        if (err) return finalCallback(err);

        // 读取之前的 records 记录
        this.readRecords((err) => {
          if (err) return finalCallback(err);

          // 执行编译
          this.compile(onCompiled);
        });
      });
    });
  }
}
```

`this.hooks.beforeRun` 和 `this.books.run` 两个钩子上挂载的插件如下：

![beforeRun&&run](https://raw.githubusercontent.com/aaaaaAndy/picture/main/images/20221215165050.png)

`beforeRun` 钩子上只挂载了一个插件：
 - `NodeEnvironmentPlugin`：该插件主要将 Node 的文件系统挂载到 compiler 上，方便后续的查找和读取。

`run` 钩子上挂载了两个插件：
 - `webpack-cli`：该插件为 `webpack-cli` 包中的 `CLIPlugin`，在这个钩子中只是打印一些编译时的信息；
 - `CachePlugin`：缓存文件，在这个钩子中是校验上一次缓存的文件状态，并记录这些文件的最后一次更新时间。

### Compiler.readRecords

读取本地记录的一些数据，一般是多次构建过程中的 module 标识。

```javascript
class Compiler extends Tapable {
  /**
   * 首先要明白records是什么意思：它是一些数据片段，用于存储多次构建过程中的module标识
   * readRecords是用来读取之前的records
   * @param callback
   * @returns {*}
   */
  readRecords(callback) {
    // recordsInputPath是webpack配置中指定的读取上一组records文件路径
    if (!this.recordsInputPath) {
      this.records = {};
      return callback();
    }

    // inputFileSystem是webpack中对fs文件系统的扩展
    // 这里主要用来判断recordsInputPath是否存在，如果存在则进行读取，并将其存储在this.records上
    this.inputFileSystem.stat(this.recordsInputPath, (err) => {
      // It doesn't exist
      // We can ignore this.
      if (err) return callback();

      this.inputFileSystem.readFile(this.recordsInputPath, (err, content) => {
        if (err) return callback(err);

        try {
          this.records = parseJson(content.toString("utf-8"));
        } catch (e) {
          e.message = "Cannot parse records: " + e.message;
          return callback(e);
        }

        return callback();
      });
    });
  }
}
```

第一次编译中 `this.record` 一般为空。

![this.record](https://raw.githubusercontent.com/aaaaaAndy/picture/main/images/20221215173040.png)

### Compiler.compile

真正的开始编译，其实这里也只是执行了几个钩子，但重要的就是在 `make` 钩子中。

```javascript
class Compiler extends Tapable {
  /**
   * 执行编译的过程
   * @param {function} callback 之前定义的onCompiled方法
   */
  compile(callback) {
    // 创建compilation的初始参数
    const params = this.newCompilationParams();

    // 执行beforeCompile钩子上的方法
    this.hooks.beforeCompile.callAsync(params, (err) => {
      if (err) return callback(err);

      // 执行compile钩子上的方法
      this.hooks.compile.call(params);

      // 创建一个新的compilation对象
      const compilation = this.newCompilation(params);

      // 开始读取文件，根据不同的loader编译不同的文件，再找出文件中的依赖文件，递归编译
      this.hooks.make.callAsync(compilation, (err) => {
        if (err) return callback(err);

        // 先执行finish方法
        compilation.finish((err) => {
          if (err) return callback(err);

          // 再执行seal方法
          // 组装编译后的内容，把module组装成一个chunk，很多优化模块大小的组件都是这个时候调用的
          compilation.seal((err) => {
            if (err) return callback(err);

            // 执行afterCompile钩子上的方法
            this.hooks.afterCompile.callAsync(compilation, (err) => {
              if (err) return callback(err);

              // 最终成功的回调，没有传入错误信息
              return callback(null, compilation);
            });
          });
        });
      });
    });
  }
}
```

#### 钩子 `beforeCompile` 和 `compile`

此时 `beforeCompile` 与 `compile` 两个钩子上并没有插件：
![beforeCompile&&compile](https://raw.githubusercontent.com/aaaaaAndy/picture/main/images/20221215173747.png)

#### `compilation` 对象

`compilation` 是编译过程中生成的一个重要对象，与 `compiler` 对象同等重要，它们两个常用来做比较：

- Compiler类(./lib/Compiler.js)：webpack的主要引擎，扩展自Tapable。webpack 从执行到结束，Compiler只会实例化一次。生成的 compiler 对象记录了 webpack 当前运行环境的完整的信息，该对象是全局唯一的，插件可以通过它获取到 webpack config 信息，如entry、output、loaders等配置。
- Compilation类(./lib/Compilation.js)：扩展自Tapable，也提供了很多关键点回调供插件做自定义处理时选择使用拓展。一个 compilation 对象代表了一次单一的版本构建和生成资源，它储存了当前的模块资源、编译生成的资源、变化的文件、以及被跟踪依赖的状态信息。简单来说，Compilation的职责就是对所有 require 图(graph)中对象的字面上的编译，构建 module 和 chunk，并利用插件优化构建过程，同时把本次打包编译的内容全存到内存里。compilation 编译可以多次执行，如在watch模式下启动 webpack，每次监测到源文件发生变化，都会重新实例化一个compilation对象，从而生成一组新的编译资源。这个对象可以访问所有的模块和它们的依赖（大部分是循环依赖）。

![compilation](https://raw.githubusercontent.com/aaaaaAndy/picture/main/images/20221215175450.png)
![compilation2](https://raw.githubusercontent.com/aaaaaAndy/picture/main/images/20221215175855.png)

#### 钩子 `make`

`make` 钩子这里开始找入口文件，可以看一下该钩子下的插件：
![make](https://raw.githubusercontent.com/aaaaaAndy/picture/main/images/20221215180139.png)

## WebpackOptionsApply

还记得在 `webpack` 的入口方法中初始化了 `WebpackOptionsApply` 插件。

```javascript
compiler.options = new WebpackOptionsApply().process(options, compiler);
```

在 `WebpackOptionsApply` 中，初始化了 `EntryOptionPlugin` 插件，然后触发 `entryOption` 钩子。

```javascript
class WebpackOptionsApply extends OptionsApply {
  process(options, compiler) {
    // 这里订阅了make钩子，开始加载文件
    new EntryOptionPlugin().apply(compiler);

    // 执行entryOptions钩子上的方法，该钩子的订阅在上面一行代码中
    compiler.hooks.entryOption.call(options.context, options.entry);
  }
}
```

在 `EntryOptionPlugin` 中，显示订阅了 `entryOption` 钩子，而在上一步中，初始化 `EntryOptionPlugin` 插件后马上触发了 `entryOption` 钩子。所以 `EntryOptionPlugin` 这里的回调函数是可以马上执行的。

```javascript
/**
 * @param {string} context context path
 * @param {EntryItem} item entry array or single path
 * @param {string} name entry key name
 * @returns {SingleEntryPlugin | MultiEntryPlugin} returns either a single or multi entry plugin
 */
const itemToPlugin = (context, item, name) => {
  if (Array.isArray(item)) {
    return new MultiEntryPlugin(context, item, name);
  }
  return new SingleEntryPlugin(context, item, name);
};

module.exports = class EntryOptionPlugin {
  /**
   * @param {Compiler} compiler the compiler instance one is tapping into
   * @returns {void}
   */
  apply(compiler) {
    // 订阅EntryOptionPlugin，然后在WebpackOptionsApply中马上调用
    compiler.hooks.entryOption.tap("EntryOptionPlugin", (context, entry) => {
      if (typeof entry === "string" || Array.isArray(entry)) {
        itemToPlugin(context, entry, "main").apply(compiler);
      } else if (typeof entry === "object") {
        for (const name of Object.keys(entry)) {
          itemToPlugin(context, entry[name], name).apply(compiler);
        }
      } else if (typeof entry === "function") {
        new DynamicEntryPlugin(context, entry).apply(compiler);
      }
      return true;
    });
  }
};
```





