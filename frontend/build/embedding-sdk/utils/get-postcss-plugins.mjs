import postcssConfig from "../../../../postcss.config.js";

export const getPostcssPlugins = () => {
  // Remove the `postcss-modules` from the plugins list, because we apply our custom plugin
  return postcssConfig.plugins.filter(
    (plugin) => plugin.postcssPlugin !== "postcss-modules",
  );
};
