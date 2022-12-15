> 初始化参数：从配置文件和 `shell` 命令中读取参数并与默认参数合并，得出最终的编译参数。

该步骤主要在 `webpack-cli` 包中进行，主要函数包括 `loadConfig()` 与 `buildConfig()`。

## loadConfig

该方法加载配置文件中的配置，如果没有指定配置文件路径，就从默认配置文件地址中取。

```javascript
/**
  * 加载本地 webpack 配置文件中的配置
  */
async loadConfig(options: Partial<WebpackDevServerOptions>) {
  // 该依赖包返回了很多常用的文件后缀名以及可以处理它们的 babel 包名
  const interpret = require("interpret");
  const loadConfigByPath = async (configPath: string, argv: Argv = {}) => {
    try {
      options = await this.tryRequireThenImport<LoadConfigOption | LoadConfigOption[]>(
        configPath,
        false,
        );
        // @ts-expect-error error type assertion
    } catch (error: Error) {
      // other code ...
    }

    // other code ...

    return { options, path: configPath };
  };

  // 定义 config 格式
  const config: WebpackCLIConfig = {
    options: {} as WebpackConfiguration,
    path: new WeakMap(),
  };

    // 如果单独配置了 webpack 的配置文件
  if (options.config && options.config.length > 0) {
    const loadedConfigs = await Promise.all(
      options.config.map((configPath: string) =>
        loadConfigByPath(path.resolve(configPath), options.argv),
        ),
      );

    config.options = [];

    loadedConfigs.forEach((loadedConfig) => {
      // other code ...
    });

    config.options = config.options.length === 1 ? config.options[0] : config.options;
  } else {
    // Order defines the priority, in decreasing order
    // 如果没有单独配置 webpack 配置文件，那么久走 webpack 默认配置文件
    const defaultConfigFiles = [
      "webpack.config",
      ".webpack/webpack.config",
      ".webpack/webpackfile",
      ]

    let foundDefaultConfigFile;

    if (foundDefaultConfigFile) {
      //  加载默认配置文件
      const loadedConfig = await loadConfigByPath(foundDefaultConfigFile.path, options.argv);

      // other code ...
    }
  }

  if (options.configName) {
    // 判断所需属性是否都存在
  }

  if (options.merge) {
    const merge = await this.tryRequireThenImport<typeof webpackMerge>("webpack-merge");
    // 合并参数
  }

  return config;
}
```

最终返回的 config 如下所示：
![config](https://raw.githubusercontent.com/aaaaaAndy/picture/main/images/20221129104631.png)

## buildConfig

该方法主要做两件事：
1. 对从配置文件中获取到的配置项进行处理，将命令行参数与webpack.config.js中的配置项进行合并；
2. 初始化一个叫 CLIPlugin 的插件。

```javascript
/**
 * 合并处理配置项及参数
 * @param  {WebpackCLIConfig}                 config  从配置文件如 webpack.config.js 中获取的配置项
 * @param  {Partial<WebpackDevServerOptions>} options 从命令行等地方获取的配置项
 */
async buildConfig(
  config: WebpackCLIConfig,
  options: Partial<WebpackDevServerOptions>,
  ): Promise<WebpackCLIConfig> {
  // 执行函数，如果参数是数组，则循环执行fn，否则，直接执行fn(options);
  // 这里是对每个配置项的区别处理
  const runFunctionOnEachConfig = (
    options: ConfigOptions | ConfigOptions[],
    fn: CallableFunction,
    ) => {
    if (Array.isArray(options)) {
      for (let item of options) {
        item = fn(item);
      }
    } else {
      options = fn(options);
    }

    return options;
  };

  // 如果有 analyze 参数，则校验引入 webpack-bundle-analyzer 包
  if (options.analyze) {
    if (!this.checkPackageExists("webpack-bundle-analyzer")) {
      await this.doInstall("webpack-bundle-analyzer", {
        preMessage: () => {
          this.logger.error(
            `It looks like ${this.colors.yellow("webpack-bundle-analyzer")} is not installed.`,
            );
        },
      });

      this.logger.success(
        `${this.colors.yellow("webpack-bundle-analyzer")} was installed successfully.`,
        );
    }
  }

  // 判断 options.process
  if (typeof options.progress === "string" && options.progress !== "profile") {
    this.logger.error(
      `'${options.progress}' is an invalid value for the --progress option. Only 'profile' is allowed.`,
      );
    process.exit(2);
  }

  // 判断 options.hot
  if (typeof options.hot === "string" && options.hot !== "only") {
    this.logger.error(
      `'${options.hot}' is an invalid value for the --hot option. Use 'only' instead.`,
      );
    process.exit(2);
  }

  // 引入 CLIPlugin
  const CLIPlugin = await this.tryRequireThenImport<
  Instantiable<CLIPluginClass, [CLIPluginOptions]>
  >("./plugins/CLIPlugin");

  // 主要是这个函数对配置进行处理
  const internalBuildConfig = (item: WebpackConfiguration) => {
  // Setup legacy logic for webpack@4
  // TODO respect `--entry-reset` in th next major release
  // TODO drop in the next major release
    // options 是最早通过命令行得到的参数，这里是将命令行参数和 webpack.config.js 中的配置进行合并
    if (options.entry) {
      item.entry = options.entry;
    }

    if (options.outputPath) {
      item.output = { ...item.output, ...{ path: path.resolve(options.outputPath) } };
    }

    if (options.target) {
      item.target = options.target;
    }

    if (typeof options.devtool !== "undefined") {
      item.devtool = options.devtool;
    }

    if (options.name) {
      item.name = options.name;
    }

    if (typeof options.stats !== "undefined") {
      item.stats = options.stats;
    }

    if (typeof options.watch !== "undefined") {
      item.watch = options.watch;
    }

    if (typeof options.watchOptionsStdin !== "undefined") {
      item.watchOptions = { ...item.watchOptions, ...{ stdin: options.watchOptionsStdin } };
    }

    if (options.mode) {
      item.mode = options.mode;
    }

      // Respect `process.env.NODE_ENV`
    if (
      !item.mode &&
      process.env &&
      process.env.NODE_ENV &&
      (process.env.NODE_ENV === "development" ||
        process.env.NODE_ENV === "production" ||
        process.env.NODE_ENV === "none")
      ) {
        item.mode = process.env.NODE_ENV;
      }

      // Setup stats
      // TODO remove after drop webpack@4
      const statsForWebpack4 =
      this.webpack.Stats &&
      (this.webpack.Stats as unknown as Partial<WebpackV4LegacyStats>).presetToOptions;

      // 定义 item.stats
      if (statsForWebpack4) {
        if (typeof item.stats === "undefined") {
          item.stats = {};
        } else if (typeof item.stats === "boolean") {
          item.stats = (this.webpack.Stats as unknown as WebpackV4LegacyStats).presetToOptions(
            item.stats,
            );
        } else if (
          typeof item.stats === "string" &&
          (item.stats === "none" ||
            item.stats === "verbose" ||
            item.stats === "detailed" ||
            item.stats === "normal" ||
            item.stats === "minimal" ||
            item.stats === "errors-only" ||
            item.stats === "errors-warnings")
          ) {
          item.stats = (this.webpack.Stats as unknown as WebpackV4LegacyStats).presetToOptions(
            item.stats,
            );
        }
      } else {
        if (typeof item.stats === "undefined") {
          item.stats = { preset: "normal" };
        } else if (typeof item.stats === "boolean") {
          item.stats = item.stats ? { preset: "normal" } : { preset: "none" };
        } else if (typeof item.stats === "string") {
          item.stats = { preset: item.stats };
        }
      }

      let colors;

      // From arguments
      if (typeof this.isColorSupportChanged !== "undefined") {
        colors = Boolean(this.isColorSupportChanged);
      }
      // From stats
      else if (typeof (item.stats as StatsOptions).colors !== "undefined") {
        colors = (item.stats as StatsOptions).colors;
      }
      // Default
      else {
        colors = Boolean(this.colors.isColorSupported);
      }

      // TODO remove after drop webpack v4
      if (typeof item.stats === "object" && item.stats !== null) {
        item.stats.colors = colors;
      }

      // Apply CLI plugin
      // 初始化插件
      if (!item.plugins) {
        item.plugins = [];
      }

      // 添加一个 CLI 插件
      item.plugins.unshift(
        new CLIPlugin({
          configPath: config.path.get(item),
          helpfulOutput: !options.json,
          hot: options.hot,
          progress: options.progress,
          prefetch: options.prefetch,
          analyze: options.analyze,
        }),
        );

      return options;
    };

    // 注意这里是把config.options传入，config.options 即为 webpack.config.js 中的各种配置项
    runFunctionOnEachConfig(config.options, internalBuildConfig);

    return config;
}
```

最终 return 的结果如下所示：
![config](https://raw.githubusercontent.com/aaaaaAndy/picture/main/images/20221129105346.png)
