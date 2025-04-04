import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { python } from "@codemirror/lang-python";
import { StreamLanguage } from "@codemirror/language";
import { clojure } from "@codemirror/legacy-modes/mode/clojure";
import { pug } from "@codemirror/legacy-modes/mode/pug";
import { ruby } from "@codemirror/legacy-modes/mode/ruby";
import type { EditorState, Extension } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  RangeSet,
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
    case "html":
      return html();
    case "json":
      return json();
    case "python":
      return python();
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
  }
}

const highlightTextMark = Decoration.mark({
  class: S.highlight,
  attributes: {
    "data-testid": "highlighted-text",
  },
});
const highlightTextEffect =
  StateEffect.define<{ start: number; end: number }[]>();

const highlightTextField = StateField.define({
  create() {
    return Decoration.none;
  },
  update(value, transaction) {
    value = value.map(transaction.changes);

    for (const effect of transaction.effects) {
      if (effect.is(highlightTextEffect)) {
        value = value
          // clear values
          .update({ filter: () => false })
          // add new values
          .update({
            add: effect.value.map(range =>
              highlightTextMark.range(range.start, range.end),
            ),
          });
      }
    }

    return value;
  },
  provide: field => EditorView.decorations.from(field),
});

export function highlightText(ranges: { start: number; end: number }[] = []) {
  return highlightTextField.init((state: EditorState) =>
    RangeSet.of(
      ranges
        .filter(
          range =>
            range.start < state.doc.length && range.end < state.doc.length,
        )
        .map(range => highlightTextMark.range(range.start, range.end)),
    ),
  );
}

export function useHighlightText(
  editorRef: RefObject<ReactCodeMirrorRef>,
  ranges: { start: number; end: number }[] = [],
) {
  useEffect(() => {
    editorRef.current?.view?.dispatch({
      effects: highlightTextEffect.of(ranges),
    });
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
