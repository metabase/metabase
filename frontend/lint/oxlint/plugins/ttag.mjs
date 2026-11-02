import { fixupPluginRules } from "@eslint/compat";
import plugin from "eslint-plugin-ttag";

import { wrap } from "../plugin.mjs";
export default wrap("ttag", fixupPluginRules(plugin));
