import * as imported from "eslint-plugin-chai-friendly";
import { wrap } from "../plugin.mjs";
const plugin = imported.default ?? imported;
export default wrap("chai-friendly", plugin);
