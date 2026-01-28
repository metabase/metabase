import { mutateColors } from "metabase/lib/colors/colors";
import MetabaseSettings from "metabase/lib/settings";

export function updateColors() {
  const scheme = MetabaseSettings.get("application-colors") || {};
  mutateColors(scheme);
}

// Update the JS colors to ensure components that use a color statically get the
// whitelabeled color (though this doesn't help if the admin changes a color and
// doesn't refresh)
try {
  updateColors();
} catch (e) {
  console.error(e);
}
