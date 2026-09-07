import * as imported from "eslint-plugin-jest-dom";
import { wrap } from "../plugin.mjs";
const plugin = imported.default ?? imported;
export default wrap("jest-dom", plugin);
