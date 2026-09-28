const { RESOLVE_ALIASES } = require("./resolve-aliases");

module.exports = {
  resolve: {
    extensions: [".js", ".jsx", ".ts", ".tsx", ".css", ".svg"],
    alias: RESOLVE_ALIASES,
    fallback: {
      buffer: require.resolve("buffer/"),
      url: require.resolve("url/"),
      events: require.resolve("events/"),
      querystring: require.resolve("querystring-es3"),
    },
  },
  externals: { canvg: "canvg" },
};
