const DemoPlugin = require('./DemoPlugin');

module.exports = {
	entry: './index.js',
	mode: 'development',
	plugins: [
		new DemoPlugin(),
	]
}
