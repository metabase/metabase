import { HAS_LOCAL_STORAGE } from "metabase/lib/dom";

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

const obfuscateString = (original, string) => {
  if (SPECIAL_STRINGS.has(original)) {
    return string.toUpperCase();
  } else {
    // divide by 2 because Unicode `FULL BLOCK` is quite wide
    return new Array(Math.ceil(string.length / 2) + 1).join("█");
  }
};

export function enableTranslatedStringReplacement() {
  const c3po = require("ttag");

  const _t = c3po.t;
  const _jt = c3po.jt;
  const _ngettext = c3po.ngettext;
  const _c = c3po.c;

  c3po.t = (...args) => {
    return obfuscateString(args[0][0], _t(...args));
  };
  c3po.ngettext = (...args) => {
    return obfuscateString(args[0][0], _ngettext(...args));
  };
  c3po.jt = (...args) => {
    const elements = _jt(...args);
    return <span style={{ backgroundColor: "currentcolor" }}>{elements}</span>;
  };
  c3po.c = (...args) => {
    return Object.assign(_c(...args), {
      t: c3po.t,
      jt: c3po.jt,
      ngettext: c3po.ngettext,
    });
  };
}

if (HAS_LOCAL_STORAGE && window.localStorage["metabase-i18n-debug"]) {
  enableTranslatedStringReplacement();
}
