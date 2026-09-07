import plugin from "eslint-plugin-cypress";
import { wrap } from "../plugin.mjs";
export default wrap("cypress", plugin);
