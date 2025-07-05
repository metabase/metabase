export const getCssLoader = ({ isDevMode }) => ({
  test: /\.css$/,
  use: [
    {
      loader: "style-loader",
    },
    {
      loader: "css-loader",
      options: {
        modules: {
          auto: (filename) =>
            !filename.includes("node_modules") &&
            !filename.includes("vendor.css"),
          localIdentName: isDevMode
            ? "[name]__[local]___[hash:base64:5]"
            : "[hash:base64:5]",
        },
        importLoaders: 1,
      },
    },
    { loader: "postcss-loader" },
  ],
});
