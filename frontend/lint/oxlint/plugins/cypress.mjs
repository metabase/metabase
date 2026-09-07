import * as imported from "eslint-plugin-cypress";
import { wrap } from "../plugin.mjs";
const plugin = imported.default ?? imported;
export default wrap("cypress", plugin);
