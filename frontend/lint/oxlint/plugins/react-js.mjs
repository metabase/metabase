import * as imported from "eslint-plugin-react";
import { wrap } from "../plugin.mjs";
const plugin = imported.default ?? imported;
export default wrap("react-js", plugin);
