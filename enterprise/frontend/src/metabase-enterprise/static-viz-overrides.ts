import { applyCustomVizStaticOverride } from "./custom_viz/custom-viz-static";
import { applyWhitelabelOverride } from "./whitelabel/static-viz-overrides";

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default function apply() {
  applyWhitelabelOverride();
  applyCustomVizStaticOverride();
}
