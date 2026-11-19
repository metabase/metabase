import type { Extension } from "@codemirror/state";
import { EditorView, tooltips } from "@codemirror/view";
import { useMemo } from "react";

import {
  EXPRESSION_COLUMNS_OUTSIDE_BRACKETS_SETTING,
  usePrototypeSetting,
} from "metabase/prototype";
import {
  expressionEditing,
  expressionTemplates,
  functionArgumentPlaceholders,
  tokenAtPos,
} from "metabase/querying/expressions";
import { STRING } from "metabase/querying/expressions/pratt";
import { isNotNull } from "metabase/utils/types";
import type * as Lib from "metabase-lib";
import type { Database } from "metabase-types/api";

import { POPULAR_FUNCTIONS } from "../ExpressionSidePanel/content";

import S from "./EditorD.module.css";
import { useGetColumnValues } from "./column-values";
import { customExpression } from "./language";
import { suggestionsD } from "./suggest";

type Options = {
  expressionMode: Lib.ExpressionMode;
  query: Lib.Query;
  stageIndex: number;
  availableColumns: Lib.ColumnMetadata[];
  availableMetrics?: Lib.MetricMetadata[];
  database: Pick<Database, "features"> | undefined;
  /** Opens the docs side panel. Must not change, or the editor reconfigures. */
  openDocs: () => void;
  /** See `SuggestOptions`. */
  highlightFirstSuggestion?: boolean;
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
    database,
    openDocs,
    highlightFirstSuggestion,
    extensions: extra = [],
  } = options;
  const getColumnValues = useGetColumnValues(query);
  const [hasColumnsOutsideBrackets] = usePrototypeSetting(
    EXPRESSION_COLUMNS_OUTSIDE_BRACKETS_SETTING,
  );

  return useMemo(() => {
    return [
      customExpression({
        expressionMode,
        query,
        stageIndex,
        availableColumns,
        availableMetrics,
        database,
      }),
      expander(),
      expressionEditing(),
      functionArgumentPlaceholders(),
      expressionTemplates({ activeClassName: S.templateActive }),
      suggestionsD({
        query,
        stageIndex,
        expressionMode,
        availableColumns,
        availableMetrics,
        database,
        columnsOutsideBrackets: hasColumnsOutsideBrackets,
        popularFunctions: POPULAR_FUNCTIONS[expressionMode],
        getColumnValues,
        openDocs,
        highlightFirstSuggestion,
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
    database,
    hasColumnsOutsideBrackets,
    getColumnValues,
    openDocs,
    highlightFirstSuggestion,
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

    // Not in a text value, where "->" may be meant as it is.
    const token = tokenAtPos(state.doc.toString(), pos - 1);
    if (token?.type === STRING) {
      return;
    }

    // With a space before it, like the separator in column names
    // ("Product → Title"). The space after it is usually typed next.
    const hasSpaceBefore = /\s/.test(state.doc.sliceString(pos - 3, pos - 2));
    view.dispatch({
      changes: {
        from: pos - 2,
        to: pos,
        insert: hasSpaceBefore || pos < 3 ? "→" : " →",
      },
    });
  });
}
