import * as imported from "eslint-plugin-import-x";
import { wrap } from "../plugin.mjs";
const plugin = imported.default ?? imported;
import { resolver } from "../resolver.mjs";
export default wrap("import-js", plugin, resolver.importSettings);
