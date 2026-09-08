import plugin from "eslint-plugin-i18next";
import { withDecodedJsxText } from "../jsx-text.mjs";
import { wrap } from "../plugin.mjs";
export default wrap("i18next", withDecodedJsxText(plugin));
