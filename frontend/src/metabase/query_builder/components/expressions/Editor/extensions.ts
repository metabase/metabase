import { acceptCompletion } from "@codemirror/autocomplete";
import { bracketMatching, syntaxHighlighting } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { EditorView, drawSelection, keymap, tooltips } from "@codemirror/view";
import { Prec } from "@uiw/react-codemirror";
import { getNonce } from "get-nonce";
import { useMemo } from "react";

import { isNotNull } from "metabase/lib/types";
import { metabaseSyntaxHighlighting } from "metabase/ui/syntax";
import type * as Lib from "metabase-lib";
import { suggestions } from "metabase-lib/v1/expressions/complete";
import type Metadata from "metabase-lib/v1/metadata/Metadata";

import { insertIndent } from "../../NativeQueryEditor/CodeMirrorEditor/extensions";

import S from "./Editor.module.css";
import { customExpression } from "./language";

type Options = {
  startRule: "expression" | "aggregation" | "boolean";
  query: Lib.Query;
  stageIndex: number;
  name?: string;
  expressionIndex: number | undefined;
  metadata: Metadata;
  reportTimezone?: string;
  extensions?: Extension[];
};

function getTooltipParent() {
  let el = document.getElementById("query-builder-tooltip-parent");
  if (el) {
    return el;
  }

  el = document.createElement("div");
  el.id = "query-builder-tooltip-parent";
  el.className = S.tooltips;
  document.body.append(el);
  return el;
}

export function useExtensions(options: Options): Extension[] {
  const {
    startRule,
    query,
    stageIndex,
    name,
    expressionIndex,
    reportTimezone,
    metadata,
    extensions: extra = [],
  } = options;

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
      EditorView.contentAttributes.of({
        autocorrect: "off",
        // To be able to let make Mantine's FocusTrap work, the content
        // element needs a tabIndex and data-autofocus attribute.
        tabIndex: "0",
        "data-autofocus": "",
      }),
      highlighting(),
      EditorView.lineWrapping,
      customExpression({
        startRule,
        query,
        stageIndex,
        name,
        expressionIndex,
        metadata,
      }),
      expander(),

      Prec.high(
        keymap.of([
          {
            key: "Tab",
            run: acceptCompletion,
          },
          {
            key: "Tab",
            run: insertIndent,
          },
        ]),
      ),
      suggestions({
        query,
        stageIndex,
        reportTimezone,
        startRule,
        expressionIndex,
        metadata,
      }),
      tooltips({
        position: "fixed",
        parent: getTooltipParent(),
      }),
      ...extra,
    ]
      .flat()
      .filter(isNotNull);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    startRule,
    query,
    stageIndex,
    name,
    expressionIndex,
    metadata,
    reportTimezone,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    ...extra,
  ]);
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
    fontFamily: "var(--mb-default-monospace-font-family)",
  };

  return EditorView.theme({
    "&": shared,
    ".cm-content": shared,
  });
}

function highlighting() {
  return syntaxHighlighting(metabaseSyntaxHighlighting);
}

/**
 * Expands -> to → when the user is typing.
 */
function expander() {
  return EditorView.updateListener.of(update => {
    if (!update.docChanged) {
      return;
    }
    const { state, view } = update;
    const pos = state.selection.main.head;
    const before = state.doc.sliceString(pos - 2, pos);

    if (before !== "->") {
      return;
    }

    view.dispatch({
      changes: {
        from: pos - 2,
        to: pos,
        insert: "→",
      },
    });
  });
}
