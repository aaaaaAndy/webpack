![v2-b839e330a1c788f25c8cbbb4126cb919_r](https://raw.githubusercontent.com/aaaaaAndy/picture/main/images/20210510132942.jpg)

`Webpack`执行主要有一下几个过程：

1.  初始化参数：从配置文件和`shell`命令中读取参数并与默认参数合并，得出最终的参数；
2.  开始编译：用上一步获取的参数初始化`Compiler`对象，加载所有配置的插件，并执行`Compiler`对象实例的`run`方法开始编译；
3.  `Compilation`实例化：生成`Compilation`实例，开始一轮新的编译；
4.  确定入口：根据配置中的`entry`找出所有的入口文件；
5.  编译模块：从入口文件开始，调用所有配置的`Loader`对模块进行翻译 ，递归找到所有依赖的模块并进行处理；
6.  完成编译：在经过第5步使用`Loader`翻译完所有模块后，得到了每个模块被翻译后的最终内容以及他们之间的依赖关系；
7.  输出资源：根据入口和模块之间的依赖关系，组装成一个个包含多个模块的`Chunk`，再把每隔`Chunk`转换成一个单独的文件加入到输出列表，这一步是可以修改内容的最后机会；
8.  输出完成：在确定好输出内容后，根据配置确定输出的路径和文件名，把文件内容写入到文件系统。

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

在`lib/webpack.js`中：

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

	// 如果options校验有报错就输出
	if (webpackOptionsValidationErrors.length) {
		throw new WebpackOptionsValidationError(webpackOptionsValidationErrors);
	}

	let compiler;
	if (Array.isArray(options)) {
		// 有多个options配置文件的情况，一般不存在这种情况
		compiler = new MultiCompiler(
			Array.from(options).map(options => webpack(options))
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
			infrastructureLogging: options.infrastructureLogging
		}).apply(compiler);

		// 注册所有自定义插件
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

		compiler.hooks.environment.call();
		compiler.hooks.afterEnvironment.call();

		// 添加一系列插件，依次调用插件的apply方法，同时给插件传入compiler实例
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

		// 否则调用run方法开始编译
		compiler.run(callback);
	}

	return compiler;
};
```

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

## 3. `Comlipation`实例化



## 4. 确定入口



## 5. 编译模块



## 6. 完成编译



## 7. 输出资源



## 8. 输出完成

