import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView, drawSelection } from "@codemirror/view";
import { type Tag, tags } from "@lezer/highlight";
import { getNonce } from "get-nonce";
import { useMemo } from "react";

import { isNotNull } from "metabase/lib/types";
import { monospaceFontFamily } from "metabase/styled-components/theme";

import { customExpression } from "./language";

export function useExtensions() {
  return useMemo(() => {
    return [
      nonce(),
      fonts(),
      drawSelection({
        cursorBlinkRate: 1000,
        drawRangeCursor: false,
      }),
      highlighting(),
      customExpression(),
    ]
      .flat()
      .filter(isNotNull);
  }, []);
}

function nonce() {
  // CodeMirror injects css into the DOM,
  // to make this work, it needs the have the correct CSP nonce.
  const nonce = getNonce();
  if (!nonce) {
    return null;
  }
  return EditorView.cspNonce.of(nonce);
}

function fonts() {
  const shared = {
    fontSize: "12px",
    lineHeight: "normal",
    fontFamily: monospaceFontFamily,
  };

  return EditorView.theme({
    "&": shared,
    ".cm-content": shared,
  });
}

const metabaseStyle = HighlightStyle.define(
  // Map all tags to CSS variables with the same name
  // See ./CodeMirrorEditor.module.css for the colors
  [
    { tag: tags.function(tags.variableName), class: "cm-call-expression" },
    ...Object.entries(tags)
      .filter((item): item is [string, Tag] => typeof item[1] !== "function")
      .map(([name, tag]: [string, Tag]) => ({
        tag,
        class: `cm-token-${name}`,
      })),
  ],
);

function highlighting() {
  return syntaxHighlighting(metabaseStyle);
}
