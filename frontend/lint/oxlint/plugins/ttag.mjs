import plugin from "eslint-plugin-ttag";
import { wrap } from "../plugin.mjs";
import { fixupPluginRules } from "@eslint/compat";
export default wrap("ttag", fixupPluginRules(plugin));
