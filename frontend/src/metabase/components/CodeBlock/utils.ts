import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { python } from "@codemirror/lang-python";
import { StreamLanguage } from "@codemirror/language";
import { clojure } from "@codemirror/legacy-modes/mode/clojure";
import { pug } from "@codemirror/legacy-modes/mode/pug";
import { ruby } from "@codemirror/legacy-modes/mode/ruby";
import type { Extension } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  type Range,
  type ReactCodeMirrorRef,
  StateEffect,
  StateField,
} from "@uiw/react-codemirror";
import { handlebarsLanguage as handlebars } from "@xiechao/codemirror-lang-handlebars";
import { getNonce } from "get-nonce";
import { type RefObject, useEffect } from "react";

import S from "./CodeBlock.module.css";
import type { CodeLanguage } from "./types";

export function getLanguageExtension(language: CodeLanguage): Extension {
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

const highlightTextEffect = StateEffect.define<Range<Decoration>[]>();
const highlightTextDecoration = Decoration.mark({
  class: S.highlight,
});

export function highlightText() {
  return StateField.define({
    create() {
      return Decoration.none;
    },
    update(value, transaction) {
      value = value.map(transaction.changes);

      for (const effect of transaction.effects) {
        if (effect.is(highlightTextEffect)) {
          value = value.update({ filter: () => false });
          value = value.update({ add: effect.value });
        }
      }

      return value;
    },
    provide: field => EditorView.decorations.from(field),
  });
}
export function useHighlightText(
  editorRef: RefObject<ReactCodeMirrorRef>,
  ranges: { start: number; end: number }[] = [],
) {
  useEffect(() => {
    const view = editorRef.current?.view;
    if (!view) {
      return;
    }

    const highlightedRanges = ranges.map(range =>
      highlightTextDecoration.range(range.start, range.end),
    );

    view.dispatch({ effects: highlightTextEffect.of(highlightedRanges) });
  }, [editorRef, ranges]);
}

export function nonce() {
  // CodeMirror injects css into the DOM,
  // to make this work, it needs the have the correct CSP nonce.
  const nonce = getNonce();
  if (!nonce) {
    return null;
  }
  return EditorView.cspNonce.of(nonce);
}
