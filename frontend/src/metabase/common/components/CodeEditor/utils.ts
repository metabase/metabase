import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { python } from "@codemirror/lang-python";
import { sql } from "@codemirror/lang-sql";
import { StreamLanguage, indentUnit } from "@codemirror/language";
import { clojure } from "@codemirror/legacy-modes/mode/clojure";
import { pug } from "@codemirror/legacy-modes/mode/pug";
import { ruby } from "@codemirror/legacy-modes/mode/ruby";
import { unifiedMergeView } from "@codemirror/merge";
import type { Extension } from "@codemirror/state";
import { handlebarsLanguage as handlebars } from "@xiechao/codemirror-lang-handlebars";
import { useMemo } from "react";
import _ from "underscore";

import type { CodeLanguage } from "./types";

export function useExtensions({
  language,
  extensions,
  originalValue,
  proposedValue,
}: {
  language?: CodeLanguage | Extension;
  extensions?: Extension[];
  originalValue?: string;
  proposedValue?: string;
}) {
  return useMemo(() => {
    const hasProposed = !!originalValue && !!proposedValue;

    return _.compact([
      ...(extensions ?? []),
      language && getLanguageExtension(language),
      hasProposed &&
        unifiedMergeView({
          original: originalValue,
          mergeControls: false,
        }),
    ]);
  }, [language, extensions, originalValue, proposedValue]);
}

export function getLanguageExtension(language: CodeLanguage | Extension) {
  if (typeof language !== "string") {
    return language;
  }

  switch (language) {
    case "clojure":
      return StreamLanguage.define(clojure);
    case "html":
      return html();
    case "json":
      return json();
    case "python":
      return [python(), indentUnit.of("    ")];
    case "mustache":
      return handlebars;
    case "pug":
      return StreamLanguage.define(pug);
    case "ruby":
      return StreamLanguage.define(ruby);
    case "typescript":
      return javascript({
        jsx: true,
        typescript: language === "typescript",
      });
    case "sql":
      return sql();
  }
}
