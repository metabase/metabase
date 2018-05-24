import React from "react";

// If enabled this monkeypatches `t` and `jt` to return blacked out
// strings/elements to assist in finding untranslated strings.
//
// Enable:
//    localStorage["metabase-i18n-debug"] = true; window.location.reload()
//
// Disable:
//    delete localStorage["metabase-i18n-debug"]; window.location.reload()
//
// Should be loaded before almost everything else.

// special strings that need to be handled specially
const SPECIAL_STRINGS = new Set([
  // Expression editor aggregation names need to be unique for the parser
  "Count",
  "CumulativeCount",
  "Sum",
  "CumulativeSum",
  "Distinct",
  "StandardDeviation",
  "Average",
  "Min",
  "Max",
]);

const obfuscateString = string => {
  if (SPECIAL_STRINGS.has(string)) {
    return string.toUpperCase();
  } else {
    // divide by 2 because Unicode `FULL BLOCK` is quite wide
    return new Array(Math.ceil(string.length / 2) + 1).join("█");
  }
};

export function enableTranslatedStringReplacement() {
  const c3po = require("c-3po");
  const _t = c3po.t;
  const _jt = c3po.jt;
  const _ngettext = c3po.ngettext;
  c3po.t = (...args) => {
    return obfuscateString(_t(...args));
  };
  c3po.ngettext = (...args) => {
    return obfuscateString(_ngettext(...args));
  };
  // eslint-disable-next-line react/display-name
  c3po.jt = (...args) => {
    const elements = _jt(...args);
    return <span style={{ backgroundColor: "currentcolor" }}>{elements}</span>;
  };
}

if (window.localStorage && window.localStorage["metabase-i18n-debug"]) {
  enableTranslatedStringReplacement();
}
