import {
  HighlightStyle,
  bracketMatching,
  syntaxHighlighting,
} from "@codemirror/language";
import { EditorView, drawSelection } from "@codemirror/view";
import { type Tag, tags } from "@lezer/highlight";
import { getNonce } from "get-nonce";
import { useMemo } from "react";

import { isNotNull } from "metabase/lib/types";
import { monospaceFontFamily } from "metabase/styled-components/theme";
import type * as Lib from "metabase-lib";

import { customExpression } from "./language";

type Options = {
  startRule: "expression" | "aggregation" | "boolean";
  query: Lib.Query;
  stageIndex: number;
  name?: string | null;
  expressionIndex: number | undefined;
};

export function useExtensions(options: Options) {
  const { startRule, query, stageIndex, name, expressionIndex } = options;

  return useMemo(() => {
    return [
      nonce(),
      fonts(),
      bracketMatching({
        brackets: "()",
      }),
      drawSelection({
        cursorBlinkRate: 1000,
        drawRangeCursor: false,
      }),
      EditorView.contentAttributes.of({ tabIndex: "0" }),
      highlighting(),
      customExpression({
        startRule,
        query,
        stageIndex,
        name,
        expressionIndex,
      }),
    ]
      .flat()
      .filter(isNotNull);
  }, [startRule, query, stageIndex, name, expressionIndex]);
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
