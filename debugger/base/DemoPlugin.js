
class DemoPlugin {
	apply(compiler) {
		console.log(333, compiler);
		compiler.hooks.emit.tap('demoPlugin', (compilation) => {
			console.log(444, compilation);
		})
	}
}

module.exports = DemoPlugin;
