import plugin from "eslint-plugin-i18next";
import { withDecodedJsxText } from "../jsx-text.mjs";
import { wrap } from "../plugin.mjs";
import { fixupPluginRules } from "@eslint/compat";
export default wrap("i18next", withDecodedJsxText(fixupPluginRules(plugin)));
