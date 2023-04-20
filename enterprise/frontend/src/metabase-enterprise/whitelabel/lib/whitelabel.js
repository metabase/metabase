import Color from "color";
import _ from "underscore";
import MetabaseSettings from "metabase/lib/settings";
import { colors, originalColors, lighten } from "metabase/lib/colors/palette";

const COLOR_REGEX =
  /(?:#[a-fA-F0-9]{3}(?:[a-fA-F0-9]{3})?\b|(?:rgb|hsl)a?\(\s*\d+\s*(?:,\s*\d+(?:\.\d+)?%?\s*){2,3}\))/;

const CSS_COLOR_UPDATORS_BY_COLOR_NAME = {};
const JS_COLOR_UPDATORS_BY_COLOR_NAME = {};

// a color not found anywhere in the app
const RANDOM_COLOR = Color({ r: 0xab, g: 0xcd, b: 0xed });

function colorScheme() {
  return { ...originalColors, ...MetabaseSettings.get("application-colors") };
}

function applicationName() {
  return MetabaseSettings.get("application-name");
}

function walkStyleSheets(sheets, fn) {
  for (const sheet of sheets) {
    let rules = [];
    try {
      // try/catch due to CORS being enforced in Chrome
      rules = sheet.cssRules || sheet.rules || [];
    } catch (e) {}
    for (const rule of rules) {
      if (rule.cssRules) {
        // child sheets, e.x. media queries
        walkStyleSheets([rule], fn);
      }
      if (rule.style) {
        for (const prop of rule.style) {
          const cssValue = rule.style.getPropertyValue(prop);
          const cssPriority = rule.style.getPropertyPriority(prop);
          fn(rule.style, prop, cssValue, cssPriority);
        }
      }
    }
  }
}

const replaceColors = (cssValue, matchColor, replacementColor) => {
  return cssValue.replace(COLOR_REGEX, colorString => {
    const color = Color(colorString);
    if (color.hex() === Color(matchColor).hex()) {
      if (color.alpha() < 1) {
        return Color(replacementColor).alpha(color.alpha()).string();
      } else {
        return replacementColor;
      }
    }
    return colorString;
  });
};

const getColorStyleProperties = _.memoize(function () {
  const properties = [];
  walkStyleSheets(
    document.styleSheets,
    (style, cssProperty, cssValue, cssPriority) => {
      // don't bother with checking if there are no colors
      if (COLOR_REGEX.test(cssValue)) {
        properties.push({ style, cssProperty, cssValue, cssPriority });
      }
    },
  );
  return properties;
});

const COLOR_MAPPINGS = {
  brand: [
    ["#509ee3", color => color], // brand
    ["#cbe2f7", color => lighten(color, 0.465)], // focus
    ["#ddecfa", color => lighten(color, 0.532)], // brand-light
  ],
};

function getCSSColorMapping(colorName) {
  if (colorName in COLOR_MAPPINGS) {
    return COLOR_MAPPINGS[colorName];
  } else {
    return [[originalColors[colorName], color => color]];
  }
}

function initColorCSS(colorName) {
  if (CSS_COLOR_UPDATORS_BY_COLOR_NAME[colorName]) {
    return;
  }
  CSS_COLOR_UPDATORS_BY_COLOR_NAME[colorName] = [];

  const colorMappings = getCSSColorMapping(colorName);
  // look for CSS rules which have colors matching the brand colors or very light or desaturated
  for (const {
    style,
    cssProperty,
    cssValue,
    cssPriority,
  } of getColorStyleProperties()) {
    for (const [originalColor, colorMapping] of colorMappings) {
      // try replacing with a random color to see if we actually need to
      if (cssValue !== replaceColors(cssValue, originalColor, RANDOM_COLOR)) {
        CSS_COLOR_UPDATORS_BY_COLOR_NAME[colorName].push(themeColor => {
          const newColor = colorMapping(themeColor);
          const newCssValue = replaceColors(cssValue, originalColor, newColor);
          style.setProperty(cssProperty, newCssValue, cssPriority);
        });
      }
    }
  }
}

function initColorJS(colorName) {
  if (JS_COLOR_UPDATORS_BY_COLOR_NAME[colorName]) {
    return;
  }

  JS_COLOR_UPDATORS_BY_COLOR_NAME[colorName] = [];
  JS_COLOR_UPDATORS_BY_COLOR_NAME[colorName].push(themeColor => {
    colors[colorName] = themeColor;
  });
}

function updateColorJS(colorName, themeColor) {
  initColorJS(colorName);
  for (const colorUpdator of JS_COLOR_UPDATORS_BY_COLOR_NAME[colorName]) {
    colorUpdator(themeColor);
  }
}

function updateColorCSS(colorName, themeColor) {
  initColorCSS(colorName);
  for (const colorUpdator of CSS_COLOR_UPDATORS_BY_COLOR_NAME[colorName]) {
    colorUpdator(themeColor);
  }
}

function updateColorsJS() {
  const scheme = colorScheme();
  for (const [colorName, themeColor] of Object.entries(scheme)) {
    updateColorJS(colorName, themeColor);
  }
}

function updateColorsCSS() {
  /*
    Currently, CSS variables are not preserved in the build and are replaced
    by computed values. Therefore, there is no way to distinguish different
    variables based on their names only. We should omit new configurable colors
    with the same values as old ones until `color-mod` function is no longer
    used in CSS and variables are preserved during the build.
   */
  const scheme = colorScheme();
  const colors = _.omit(scheme, ["filter", "summarize", "accent0"]);
  for (const [colorName, themeColor] of Object.entries(colors)) {
    updateColorCSS(colorName, themeColor);
  }
}

export function updateColors() {
  updateColorsCSS();
  updateColorsJS();
}

// APPLICATION NAME

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
// Don't update CSS colors yet since all the CSS hasn't been loaded yet
try {
  updateColorsJS();
} catch (e) {
  console.error(e);
}
