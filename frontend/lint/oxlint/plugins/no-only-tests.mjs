import * as imported from "eslint-plugin-no-only-tests";
import { wrap } from "../plugin.mjs";
const plugin = imported.default ?? imported;
export default wrap("no-only-tests", plugin);
