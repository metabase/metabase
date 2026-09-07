import * as imported from "eslint-plugin-i18next";
import { withDecodedJsxText } from "../jsx-text.mjs";
import { wrap } from "../plugin.mjs";
const plugin = imported.default ?? imported;
export default wrap("i18next", withDecodedJsxText(plugin));
