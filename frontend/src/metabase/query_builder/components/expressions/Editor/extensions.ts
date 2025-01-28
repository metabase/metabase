import { bracketMatching, syntaxHighlighting } from "@codemirror/language";
import { EditorView, drawSelection, keymap, tooltips } from "@codemirror/view";
import { Prec } from "@uiw/react-codemirror";
import { getNonce } from "get-nonce";
import { useMemo } from "react";

import { useSelector } from "metabase/lib/redux";
import { isNotNull } from "metabase/lib/types";
import { getMetadata } from "metabase/selectors/metadata";
import { monospaceFontFamily } from "metabase/styled-components/theme";
import type * as Lib from "metabase-lib";

import css from "./Editor.module.css";
import { highlightStyle } from "./Highlight";
import { customExpression } from "./language";
import { suggestions } from "./suggestions";
import { useTooltip } from "./tooltip";

type Options = {
  startRule: "expression" | "aggregation" | "boolean";
  query: Lib.Query;
  stageIndex: number;
  name?: string | null;
  expressionIndex: number | undefined;
  onCommit: (source: string) => void;
  reportTimezone?: string;
};

function getTooltipParent() {
  let el = document.getElementById("query-builder-tooltip-parent");
  if (el) {
    return el;
  }

  el = document.createElement("div");
  el.id = "query-builder-tooltip-parent";
  el.className = css.tooltips;
  document.body.append(el);
  return el;
}

export function useExtensions(options: Options) {
  const {
    startRule,
    query,
    stageIndex,
    name,
    expressionIndex,
    onCommit,
    reportTimezone,
  } = options;

  const metadata = useSelector(getMetadata);
  const [tooltip, content] = useTooltip({ query, metadata, reportTimezone });

  const extensions = useMemo(() => {
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
      customExpression({
        startRule,
        query,
        stageIndex,
        name,
        expressionIndex,
      }),
      Prec.high(
        keymap.of([
          {
            key: "Enter",
            run(view: EditorView) {
              const source = view.state.doc.toString();
              onCommit(source);
              return true;
            },
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
      tooltip,
    ]
      .flat()
      .filter(isNotNull);
  }, [
    startRule,
    query,
    stageIndex,
    name,
    expressionIndex,
    onCommit,
    metadata,
    reportTimezone,
    tooltip,
  ]);

  return { extensions, content };
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

function highlighting() {
  return syntaxHighlighting(highlightStyle);
}
