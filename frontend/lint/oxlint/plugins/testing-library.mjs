import * as imported from "eslint-plugin-testing-library";
import { wrap } from "../plugin.mjs";
const plugin = imported.default ?? imported;
export default wrap("testing-library", plugin);
