import * as imported from "eslint-plugin-i18next";
import { wrap } from "../plugin.mjs";
const plugin = imported.default ?? imported;
export default wrap("i18next", plugin);
