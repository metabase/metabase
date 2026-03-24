import type { Extension } from "@codemirror/state";
import { EditorView, tooltips } from "@codemirror/view";
import { useMemo } from "react";

import { isNotNull } from "metabase/lib/types";
import { suggestions } from "metabase/querying/expressions";
import type * as Lib from "metabase-lib";
import type Metadata from "metabase-lib/v1/metadata/Metadata";

import S from "./Editor.module.css";
import { customExpression } from "./language";

type Options = {
  expressionMode: Lib.ExpressionMode;
  query: Lib.Query;
  stageIndex: number;
  availableColumns: Lib.ColumnMetadata[];
  availableMetrics?: Lib.MetricMetadata[];
  metadata: Metadata;
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
    expressionMode,
    query,
    stageIndex,
    availableColumns,
    availableMetrics,
    metadata,
    extensions: extra = [],
  } = options;

  return useMemo(() => {
    return [
      customExpression({
        expressionMode,
        query,
        stageIndex,
        availableColumns,
        availableMetrics,
        metadata,
      }),
      expander(),
      suggestions({
        query,
        stageIndex,
        expressionMode,
        availableColumns,
        availableMetrics,
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
    expressionMode,
    query,
    stageIndex,
    availableColumns,
    metadata,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    ...extra,
  ]);
}

/**
 * Expands -> to → when the user is typing.
 */
function expander() {
  return EditorView.updateListener.of((update) => {
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
