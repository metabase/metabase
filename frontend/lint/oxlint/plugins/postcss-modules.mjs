import { fixupPluginRules } from "@eslint/compat";
import plugin from "eslint-plugin-postcss-modules";
import { wrap } from "../plugin.mjs";

export default wrap(
  "postcss-modules",
  fixupPluginRules(plugin),
  (settings) => ({
    ...settings,
    "postcss-modules": { baseDir: "./frontend/src" },
  }),
);
