import * as imported from "../../eslint-plugin-metabase/index.js";
import { wrap } from "../plugin.mjs";
const plugin = imported.default ?? imported;
export default wrap("metabase", plugin);
