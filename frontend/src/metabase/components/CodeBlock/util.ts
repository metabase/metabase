import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { python } from "@codemirror/lang-python";
import { StreamLanguage } from "@codemirror/language";
import { clojure } from "@codemirror/legacy-modes/mode/clojure";
import { pug } from "@codemirror/legacy-modes/mode/pug";
import { ruby } from "@codemirror/legacy-modes/mode/ruby";
import type { Extension } from "@codemirror/state";
import { handlebarsLanguage as handlebars } from "@xiechao/codemirror-lang-handlebars";

import type { CodeLanguage } from "./types";

export function getLanguageExtension(language: CodeLanguage): Extension | null {
  switch (language) {
    case "clojure":
      return StreamLanguage.define(clojure);
    case "erb":
    case "html":
      return html();
    case "json":
      return json();
    case "python":
      return python();
    case "mustache":
      return handlebars;
    case "jade":
    case "pug":
      return StreamLanguage.define(pug);
    case "ruby":
      return StreamLanguage.define(ruby);
    case "javascript":
    case "typescript":
      return javascript({
        jsx: true,
        typescript: language === "typescript",
      });
  }
}
