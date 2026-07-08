import { initializePlugin as initializeCustomVizPlugin } from "./custom_viz";
import { applyWhitelabelOverride } from "./whitelabel/static-viz-overrides";

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default function apply() {
  applyWhitelabelOverride();
  initializeCustomVizPlugin();
}
