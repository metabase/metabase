import { colors } from "metabase/lib/colors/palette";
import MetabaseSettings from "metabase/lib/settings";

export function updateColors() {
  const scheme = MetabaseSettings.get("application-colors") || {};
  for (const [colorName, themeColor] of Object.entries(scheme)) {
    colors[colorName] = themeColor;
  }
}

// Update the JS colors to ensure components that use a color statically get the
// whitelabeled color (though this doesn't help if the admin changes a color and
// doesn't refresh)
try {
  updateColors();
} catch (e) {
  console.error(e);
}
