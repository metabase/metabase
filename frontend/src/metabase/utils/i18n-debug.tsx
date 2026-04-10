import { localStorageIsSupported } from "metabase/utils/dom";

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

const obfuscateString = (original: string, string: string): string => {
  if (SPECIAL_STRINGS.has(original)) {
    return string.toUpperCase();
  } else {
    // divide by 2 because Unicode `FULL BLOCK` is quite wide
    return new Array(Math.ceil(string.length / 2) + 1).join("█");
  }
};

/**
 * Describes the shape of the `ttag` module exports we need to mutate.
 * babel-plugin-ttag rejects `import * as ttag from "ttag"` and `import("ttag")`,
 * so we use `require` at runtime and this type for static typing.
 */
type TTagModule = {
  t: (strings: TemplateStringsArray, ...expr: unknown[]) => string;
  jt: (
    strings: TemplateStringsArray,
    ...expr: unknown[]
  ) => string | string[] | JSX.Element;
  ngettext: (...args: unknown[]) => string;
  c: (context: string) => {
    t: TTagModule["t"];
    jt: TTagModule["jt"];
    gettext: (id: string) => string;
    ngettext: TTagModule["ngettext"];
  };
};

export function enableTranslatedStringReplacement() {
  // ttag is mutated at runtime to replace its exported functions with obfuscating wrappers.
  // Using require here (instead of a named import) because:
  //   1. babel-plugin-ttag forbids namespace imports of ttag
  //   2. ES module named imports are read-only bindings and cannot be reassigned
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- must mutate ttag exports
  const c3po: TTagModule = require("ttag");

  const _t = c3po.t;
  const _jt = c3po.jt;
  const _ngettext = c3po.ngettext;
  const _c = c3po.c;

  c3po.t = (strings: TemplateStringsArray, ...expr: unknown[]): string => {
    return obfuscateString(strings[0], _t(strings, ...expr));
  };

  // ngettext's first arg is a msgid string; coerce to string for the obfuscation key
  c3po.ngettext = (...args: unknown[]): string => {
    return obfuscateString(String(args[0]), _ngettext(...args));
  };

  // jt normally returns string | string[]; we replace it with a JSX element for visual debug
  c3po.jt = (
    strings: TemplateStringsArray,
    ...expr: unknown[]
  ): JSX.Element => {
    const elements = _jt(strings, ...expr);
    return <span style={{ backgroundColor: "currentcolor" }}>{elements}</span>;
  };

  c3po.c = (context: string) => {
    return Object.assign(_c(context), {
      t: c3po.t,
      jt: c3po.jt,
      ngettext: c3po.ngettext,
    });
  };
}

if (localStorageIsSupported() && window.localStorage["metabase-i18n-debug"]) {
  enableTranslatedStringReplacement();
}
