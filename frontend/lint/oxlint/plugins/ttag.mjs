import * as imported from "eslint-plugin-ttag";
import { wrap } from "../plugin.mjs";
const plugin = imported.default ?? imported;
export default wrap("ttag", plugin);
