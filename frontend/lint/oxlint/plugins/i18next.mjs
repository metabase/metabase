import * as imported from "eslint-plugin-i18next";
import { wrap } from "../plugin.mjs";
const plugin = imported.default ?? imported;
import { fixupPluginRules } from "@eslint/compat";
export default wrap("i18next", fixupPluginRules(plugin));
