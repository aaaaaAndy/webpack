

![1571560979-52c8a3ffc688947a](https://raw.githubusercontent.com/aaaaaAndy/picture/main/images/20210510153930.png)

`Webpack`执行主要有一下几个过程：

1.  初始化参数：从配置文件和`shell`命令中读取参数并与默认参数合并，得出最终的参数；
2.  开始编译：用上一步获取的参数初始化`Compiler`对象，加载所有配置的插件，并执行`Compiler`对象实例的`run`方法开始编译；
4.  确定入口：根据配置中的`entry`找出所有的入口文件；
5.  编译模块：从入口文件开始，调用所有配置的`Loader`对模块进行翻译 ，递归找到所有依赖的模块并进行处理；
6.  完成编译：在经过第5步使用`Loader`翻译完所有模块后，得到了每个模块被翻译后的最终内容以及他们之间的依赖关系；
7.  输出资源：根据入口和模块之间的依赖关系，组装成一个个包含多个模块的`Chunk`，再把每隔`Chunk`转换成一个单独的文件加入到输出列表，这一步是可以修改内容的最后机会；
8.  输出完成：在确定好输出内容后，根据配置确定输出的路径和文件名，把文件内容写入到文件系统。



`Webpack`是基于`Tapable`实现的插件化，所以在阅读`Webpack`源码之前应该先了解`Tapable`的工作原理：[《Tapable源码》](https://aaaaaandy.github.io/tapable/#/source)

## 1. 初始化参数

### 1.1 启动方式

拿到[webpack源码](https://github.com/aaaaaAndy/webpack/tree/study-webpack-4)之后不要着急，首先应该查看根目录下的`package.json`文件，可以很清楚的看到：

```json
{
  // other code ...
  "main": "lib/webpack.js",
  "web": "lib/webpack.web.js",
  "bin": "./bin/webpack.js",
  // other code ...
}
```

由此可知，`webpack`有两种启动方式：一种是作为一个依赖包被引入项目中，通过`main`或者`web`暴露的方法来启动，另一种是注册一个`webpack`命令，通过`shell`命令的方式启动。

#### 1. 作为依赖包启动

当`webpack`作为依赖包的模式启动时与普通的npm包无异：

```javascript
const webpack = require('webpack');

const compiler = webpack(options, (err, stats) => {
  if (err || stats.hasError()) {
    throw new Error('编译失败！！！');
  }
  
  console.log('编译成功！！！')
})
```

此时，调用逻辑最终走入到`lib/webpack.js`文件中。

#### 2. 命令行启动

```shell
webpack --config webpack.config.js --open
```

如果以上述命令方式启动`webpack`，那么将先会走到`bin/webpack.js`中：

```javascript
const packageName = "webpack-cli";

runCommand(packageManager, installOptions.concat(packageName))
  .then(() => {
  		require(packageName); //eslint-disable-line
	})
  .catch(error => {
  		console.error(error);
			process.exitCode = 1;
	});
```

由上述代码可以看出，在`bin/webpack.js`中，会判断`webpack-cli`这个包是否存在，如果不存在则先安装，如果存在则直接加载`webpack-cli`这个依赖包。

在`webpack-cli`包中有一个`WebpackCLI`类：

```javascript
class WebpackCLI {
	constructor() {
		this.webpack = require('webpack');
		// other code ...
	}

	async createCompiler(options, callback) {
		let compiler;

		this.applyNodeEnv(options);

		let config = await this.resolveConfig(options);

		config = await this.applyOptions(config, options);

		// 添加CLIPlugin，这是一个默认plugin
		config = await this.applyCLIPlugin(config, options);

		try {
			// 调用webpack方法
			compiler = new this.webpack(
				config.options,
				callback
					? (error, stats) => {
						if (error && this.isValidationError(error)) {
							this.logger.error(error.message)
							process.exit(2);
						}
						callback(error, stats);
					}
					: callback,
			)
		} catch() {
			// other code ...
		}
	}

	// other code...
}
```

可以看出，`webpack-cli`主要来处理参数，从`shell`命令上或者从配置文件`webpack.config.js`中获取参数，并进行合并。最终还是调用`lib/webpack.js`中的`webpack`方法。

### 1.2 添加默认参数

在`webpack`包的`lib/webpack.js`文件中：

```javascript
const webpack = (options, callback) => {
	// options数据格式校验，JSON Schema
	const webpackOptionsValidationErrors = validateSchema(
		webpackOptionsSchema,
		options
	);

	// 如果options校验有报错就输出
	if (webpackOptionsValidationErrors.length) {
		throw new WebpackOptionsValidationError(webpackOptionsValidationErrors);
	}
  
  if (typeof options === 'object') {
    // 正常流程，options是个对象
		// 将options与默认的options进行融合
		options = new WebpackOptionsDefaulter().process(options);
  }
  
  // other code ...
}
```

此处将`webpack-cli`收集的参数与`webpack`的默认参数进行合并。

## 2. 开始编译

### 2.1 `webpack`启动方法

在`lib/webpack.js`中，有一个`webpack`方法，它是整个`webpack`包的入口：

此`webpack`方法的主要功能有以下几步：

1.  校验传入的`options`格式，如果有报错就抛出错误；
2.  如果传入的`options`是个数组，则实例化`MultiCompiler`获得一个`compiler`；
3.  如果传入的`options`是个对象，接着进行下列操作（这也是大部分情况下的逻辑）;
4.  调用`WebpackOptionsDefaulter`设置`webpack`默认参数；
5.  实例化`Compiler`，获得一个`compiler`实例，并将`options`设置到`compiler`上；
6.  实例化`NodeEnvironmentPlugin`，给`compiler`挂载上经过拓展的`fs`文件操作方法；
7.  挂载所有的`Plugins`，即执行`plugin`对应的`apply`方法；
8.  调用`environment`和`afterEnvironment`两个`hooks`；
9.  实例化`WebpackOptionsApply`，给`webpack`挂载默认的一下钩子；
10.  判断是否有回调`callback`，如果有，调用`compiler.run()`；否则直接返回`compiler`实例；

```javascript
/**
 * 对外暴露的webpack
 * @param {WebpackOptions} options options webpack所需参数
 * @param {function(Error=, Stats=): void=} callback callback 回调
 * @returns {Compiler | MultiCompiler} the compiler object
 */
const webpack = (options, callback) => {
	// 1. options数据格式校验，JSON Schema
	const webpackOptionsValidationErrors = validateSchema(
		webpackOptionsSchema,
		options
	);

	// 1. 如果options校验有报错就输出
	if (webpackOptionsValidationErrors.length) {
		throw new WebpackOptionsValidationError(webpackOptionsValidationErrors);
	}

	let compiler;
	if (Array.isArray(options)) {
		// 2. 有多个options配置文件的情况，一般不存在这种情况
		compiler = new MultiCompiler(
			Array.from(options).map(options => webpack(options))
		);
	} else if (typeof options === "object") {
		// 3. 正常流程，options是个对象
		// 4. 将options与默认的options进行融合
		options = new WebpackOptionsDefaulter().process(options);

		// 5. 初始化Compiler实例
		compiler = new Compiler(options.context);
		compiler.options = options;

		// 6. 磁盘输入输出文件操作
		// 应用Node的文件系统到compiler，方便后续的查找和读取
		new NodeEnvironmentPlugin({
			infrastructureLogging: options.infrastructureLogging
		}).apply(compiler);

		// 7. 注册所有自定义插件
		if (options.plugins && Array.isArray(options.plugins)) {
			// 依次调用插件的apply方法，若为函数则直接调用
			// 同时将compiler对象传入，方便插件调用本次构建提供的webpack API并监听后续所有事件hook
			for (const plugin of options.plugins) {
				if (typeof plugin === "function") {
					plugin.call(compiler, compiler);
				} else {
					plugin.apply(compiler);
				}
			}
		}

    // 8. 调用environment与afterEnvironment两个hooks
		compiler.hooks.environment.call();
		compiler.hooks.afterEnvironment.call();

		// 9. 添加一系列插件，依次调用插件的apply方法，同时给插件传入compiler实例
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
			(Array.isArray(options) && options.some(o => o.watch))
		) {
			const watchOptions = Array.isArray(options)
				? options.map(o => o.watchOptions || {})
				: options.watchOptions || {};
			return compiler.watch(watchOptions, callback);
		}

		// 10. 否则调用run方法开始编译
		compiler.run(callback);
	}

	return compiler;
};
```

### 2.2 `Compiler`对象

`Compiler`对象包含了`Webpack`环境所有的配置信息，包含`options`，`loader`，`plugins`等，这个对象在`Webpack`启动的时候被实例化，它是全局唯一的，可以把它简单的理解为`Webpack`实例。它代表了`Webpack`从启动到关系的生命周期。

在`lib/Compiler.js`文件中，定义了`Compiler`对象：

```javascript
class Compiler extends Tapable {
  constructor() {
    // 定义Compiler的生命周期钩子
    this.hooks = { /*code*/ }
  }
  
  run(callback) {
    // other code ...
    
    // 调用beforeRun钩子上的方法
		this.hooks.beforeRun.callAsync(this, err => {
			if (err) return finalCallback(err);

			// 调用run钩子上的方法
			this.hooks.run.callAsync(this, err => {
				if (err) return finalCallback(err);

				// 读取之前的records记录
				this.readRecords(err => {
					if (err) return finalCallback(err);

					// 执行编译
					this.compile(onCompiled);
				});
			});
		});
  }
  
  /**
	 * 执行编译的过程
	 * @param {function} callback 之前定义的onCompiled方法
	 */
  compile(callback) {
    // 创建compilation的初始参数
		const params = this.newCompilationParams();

		// 执行beforeCompile钩子上的方法
		this.hooks.beforeCompile.callAsync(params, err => {
			if (err) return callback(err);

			// 执行compile钩子上的方法
			this.hooks.compile.call(params);

			// 创建一个新的compilation对象
			const compilation = this.newCompilation(params);

			// 开始读取文件，根据不同的loader编译不同的文件，再找出文件中的依赖文件，递归编译
			this.hooks.make.callAsync(compilation, err => {
				if (err) return callback(err);

				// 先执行finish方法
				compilation.finish(err => {
					if (err) return callback(err);

					// 再执行seal方法
					// 组装编译后的内容，把module组装成一个chunk，很多优化模块大小的组件都是这个时候调用的
					compilation.seal(err => {
						if (err) return callback(err);

						// 执行afterCompile钩子上的方法
						this.hooks.afterCompile.callAsync(compilation, err => {
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

可以看到在`run`方法中，先后调用了`beforeRun`和`run`两个`hook`，然后调用`compile`方法。在`compile`方法中，又先后调用了`beforeCompile`和`compile`两个`hook`。这些都是在真正开始编译之前暴露出的钩子，可供自定义的`plugin`修改`compiler`上的配置。

`const compilation = this.newCompilation(params);`这行代码主要是重新实例化一个`Compilation`对象，开始新一轮的编译。具体内部如何实现，我们在 [2. 3 `Compilation`对象](#2.3 `Compilation`对象)一章中详细讲解。

接下来调用了`make`对应的钩子，这个钩子才是真正开始执行了编译。基于`Tapable`的插件机制，我们在[3. 确定入口](#3. 确定入口)一章中详细讲解。

在`make`钩子执行完毕后，又先后执行了`finish`， `seal`和`afterCompile`几个钩子，其中`finish`是代表资源处理完成，`seal`是将处理后的资源进行拼装分解，组成一个个的`chunk`，`afterCompile`就是结束编译的意思。

### 2.3 `Compilation`对象

`Compilation`对象在每次重新编译时都会重新实例化一次，包含了当次编译的模块资源，编译生成资源，变化的文件等。当`Webpack`以开发模式运行时，每当检测到一个文件变化时，都会重新实例化一次`Compilation`。它只代表一次新的编译。

在`Compiler`对象的`compile`方法中，有一个入口调用：

```javascript
const params = this.newCompilationParams();
const compilation = this.newCompilation(params);
```

其中`this.newCompilationParams()`是获取几个`Factory`，用来作为参数传入`Compilation`。

```javascript
class Compiler {
  createNormalModuleFactory() {
		const normalModuleFactory = new NormalModuleFactory(
			this.options.context,
			this.resolverFactory,
			this.options.module || {}
		);
		this.hooks.normalModuleFactory.call(normalModuleFactory);
		return normalModuleFactory;
	}

	createContextModuleFactory() {
		const contextModuleFactory = new ContextModuleFactory(this.resolverFactory);
		this.hooks.contextModuleFactory.call(contextModuleFactory);
		return contextModuleFactory;
	}

	newCompilationParams() {
		const params = {
			normalModuleFactory: this.createNormalModuleFactory(),
			contextModuleFactory: this.createContextModuleFactory(),
			compilationDependencies: new Set()
		};
		return params;
	}
}
```

`this.newCompilation()`即为实例化一个`Compilation`对象：

```javascript
class Compiler {
  createCompilation() {
		return new Compilation(this);
	}

	newCompilation(params) {
		const compilation = this.createCompilation();
		compilation.fileTimestamps = this.fileTimestamps;
		compilation.contextTimestamps = this.contextTimestamps;
		compilation.name = this.name;
		compilation.records = this.records;
		compilation.compilationDependencies = params.compilationDependencies;
		this.hooks.thisCompilation.call(compilation, params);
		this.hooks.compilation.call(compilation, params);
		return compilation;
	}
}
```

待到`Compilation`实例化完成，编译真正的开始了。

## 3. 确定入口

在`Compiler`对象的`compile`方法中，有一行`this.hooks.make.callAsync()`的代码，这是一种基于`Tapable`的插件机制，在`Compiler`中，只负责调用具体的钩子，真正的执行流程还要看都有哪些插件订阅了哪个钩子。

### 3.1 `webpack`加载插件

寻根溯源，在`webpack.js`文件中，`Webpack`的入口方法`webpack`，有一段处理是要加载默认的插件：

```javascript
// 添加一系列插件，依次调用插件的apply方法，同时给插件传入compiler实例
compiler.options = new WebpackOptionsApply().process(options, compiler);
```

在`WebpackOptionsApply`类的`process`方法中，挂在了`Webpack`编译过程中需要的各种插件，在这些插件中，订阅了各个`hook`事件。所以当我们需要找到`this.hook.make`调用的逻辑时，就应该来此处看哪些插件订阅了`make`这个钩子。

```javascript
class WebpackOptionsApply {
  process(options, compiler) {
    // other code ...
    // 这里订阅了make钩子，开始加载文件
		new EntryOptionPlugin().apply(compiler);
    // other code ...
  }
}
```

### 3.2 `EntryOptionPlugin`类

在`EntryOptionPlugin`类中：

```javascript
const itemToPlugin = (context, item, name) => {
	if (Array.isArray(item)) {
		return new MultiEntryPlugin(context, item, name);
	}
	return new SingleEntryPlugin(context, item, name);
};

class EntryOptionPlugin {
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

可以看到，当入口`entry`有多个时，调用`MultiEntryPlugin`，当`entry`只有一个时，调用`SingleEntryPlugin`。

### 3.3 `SingleEntryPlugin`类

我们以单入口的情况来分析，在`SingleEntryPlugin`中：

```javascript
class SingleEntryPlugin {
  // other code ...
  
  /**
	 * @param {Compiler} compiler the compiler instance
	 * @returns {void}
	 */
	apply(compiler) {
		// 订阅compilation钩子，这一步也很重要
		compiler.hooks.compilation.tap(
			"SingleEntryPlugin",
			(compilation, { normalModuleFactory }) => {
				compilation.dependencyFactories.set(
					SingleEntryDependency,
					normalModuleFactory
				);
			}
		);

		// 订阅make钩子
		compiler.hooks.make.tapAsync(
			"SingleEntryPlugin",
			(compilation, callback) => {
				const { entry, name, context } = this;

				// 调用compilation的addEntry方法
				const dep = SingleEntryPlugin.createDependency(entry, name);
				compilation.addEntry(context, dep, name, callback);
			}
		);
	}
  
  /**
	 * @param {string} entry entry request
	 * @param {string} name entry name
	 * @returns {SingleEntryDependency} the dependency
	 */
	static createDependency(entry, name) {
		const dep = new SingleEntryDependency(entry);
		dep.loc = { name };
		return dep;
	}
}
```

可以看到，就是在`SingleEntryPlugin`中的`apply`方法内，这里订阅了`make`钩子。即当执行`this.hook.make.callSync()`时，会执行这里的回调。

## 4. 编译模块

在确定入口之后，`Webpack`要做的事情就是加载文件并进行解析编译，在`lib/Compilation.js`文件中：

```javascript
class Compilation {
  
  /**
	 * 编译开始，添加入口文件
	 * @param {string} context context path for entry
	 * @param {Dependency} entry entry dependency being created
	 * @param {string} name name of entry
	 * @param {ModuleCallback} callback callback function
	 * @returns {void} returns
	 */
  addEntry(context, entry, name, callback) {
    // code ...
    
    // addEntry主要调用_addModuleChain方法
		this._addModuleChain(
			context,
			entry,
			module => {
				this.entries.push(module);
			},
			(err, module) => {/* code ... */}
		);
  }
  
  /**
	 *
	 * @param {string} context context string path
	 * @param {Dependency} dependency dependency used to create Module chain
	 * @param {OnModuleCallback} onModule function invoked on modules creation
	 * @param {ModuleChainCallback} callback callback for when module chain is complete
	 * @returns {void} will throw if dependency instance is not a valid Dependency
	 */
	_addModuleChain(context, dependency, onModule, callback) {
    // code ...
    
    // semaphorel类似于一个线程池，对并发数量进行控制，默认最多同时运行100个任务
		this.semaphore.acquire(() => {
			// 调用工厂函数NormalModuleFactory的create来生成一个空的NormalModule对象
			// 可以认为一个文件即为一个module
			moduleFactory.create(
				{
					contextInfo: {
						issuer: "",
						compiler: this.compiler.name
					},
					context: context,
					dependencies: [dependency]
				},
				(err, module) => {

					// _addModuleChain中接收参数dependency传入的入口依赖，使用对应的工厂函数NormalModuleFactory.create方法生成一个空的module对象,
					// 回调中会把此module存入compilation.modules对象和dependencies.module对象中，由于是入口文件，也会存入compilation.entries中。
					const addModuleResult = this.addModule(module);
					module = addModuleResult.module;

					onModule(module);

					const afterBuild = () => {
						if (addModuleResult.dependencies) {
							// 递归处理文件的依赖
              // 用于获取需要被递归解析的依赖
							this.processModuleDependencies(module, err => {
								if (err) return callback(err);
								callback(null, module);
							});
						} else {
							return callback(null, module);
						}
					};

					// 执行buildModule进入真正的构建module内容的过程
					if (addModuleResult.build) {
						this.buildModule(module, false, null, null, err => {
							this.semaphore.release();
							afterBuild();
						});
					} else {/* code ... */
					}
				}
			);
		})
  }
                           
  /**
	 * Builds the module object
	 *
	 * @param {Module} module module to be built
	 * @param {boolean} optional optional flag
	 * @param {Module=} origin origin module this module build was requested from
	 * @param {Dependency[]=} dependencies optional dependencies from the module to be built
	 * @param {TODO} thisCallback the callback
	 * @returns {TODO} returns the callback function with results
	 */
	buildModule(module, optional, origin, dependencies, thisCallback) {
    // code ...
    module.build(
			this.options,
			this,
			this.resolverFactory.get("normal", module.resolveOptions),
			this.inputFileSystem,
			error => {/* code... */}
    )
  }
}
```

`module.build`最终调用的是`lib/NormalModule.js`中的`build`方法：

```javascript
class NormalModule {
  build(options, compilation, resolver, fs, callback) {
    return this.doBuild(options, compilation, resolver, fs, err => {
      // code ...
      try {
        // 这里转换成ast语法树进行解析
				const result = this.parser.parse(
					this._ast || this._source.source(),
					{
						current: this,
						module: this,
						compilation: compilation,
						options: options
					},
					(err, result) => {
						if (err) {
							handleParseError(err);
						} else {
							handleParseResult(result);
						}
					}
				);
				if (result !== undefined) {
					// parse is sync
					handleParseResult(result);
				}
			} catch (e) {
				handleParseError(e);
			}
    })
  }
  
  doBuild(options, compilation, resolver, fs, callback) {
    // code...
    // 调用相应的loader，把我们的模块转换成标准的js模块
		runLoaders(
			{
				resource: this.resource,
				loaders: this.loaders,
				context: loaderContext,
				readResource: fs.readFile.bind(fs)
			},
			(err, result) => {
        callback(result)
      }
    )
  }
}
```

可以看出，经过一连串的调用，`Webpack`先是读取了入口文件，然后调用对应的`loader`将其转换为`js`可以识别的内容格式，然后进行`parse`将其转换为`AST`语法树，最后调用外层的回调`this.processModuleDependencies()`处理该模块的依赖。

## 5. 完成编译



## 6. 输出资源



## 7. 输出完成

