import MetabaseSettings from "metabase/lib/settings";
import { colors, originalColors } from "metabase/lib/colors/palette";

function colorScheme() {
  return { ...originalColors, ...MetabaseSettings.get("application-colors") };
}

function updateColorsJS() {
  const scheme = colorScheme();
  for (const [colorName, themeColor] of Object.entries(scheme)) {
    colors[colorName] = themeColor;
  }
}

export function updateColors() {
  updateColorsJS();
}

// APPLICATION NAME

function applicationName() {
  return MetabaseSettings.get("application-name");
}

function replaceApplicationName(string) {
  return string.replace(/Metabase/g, applicationName());
}

export function enabledApplicationNameReplacement() {
  const c3po = require("ttag");
  const _t = c3po.t;
  const _jt = c3po.jt;
  const _ngettext = c3po.ngettext;
  c3po.t = (...args) => {
    return replaceApplicationName(_t(...args));
  };
  c3po.ngettext = (...args) => {
    return replaceApplicationName(_ngettext(...args));
  };
  c3po.jt = (...args) => {
    return _jt(...args).map(element =>
      typeof element === "string" ? replaceApplicationName(element) : element,
    );
  };
}

// Update the JS colors to ensure components that use a color statically get the
// whitelabeled color (though this doesn't help if the admin changes a color and
// doesn't refresh)
try {
  updateColorsJS();
} catch (e) {
  console.error(e);
}
