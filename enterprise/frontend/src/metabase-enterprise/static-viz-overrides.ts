// Applied inside the GraalJS static-viz contexts only. Uses the static-only
// custom-viz initializer (registry, not the interactive admin pages) so the
// static-viz bundles stay free of the app UI stack.
import { initializeStaticVizPlugin } from "./custom_viz/custom-viz-static";
import { applyWhitelabelOverride } from "./whitelabel/static-viz-overrides";

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default function apply() {
  applyWhitelabelOverride();
  initializeStaticVizPlugin();
}
