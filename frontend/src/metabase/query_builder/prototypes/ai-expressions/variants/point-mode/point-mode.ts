import { createContext, useContext, useEffect } from "react";

import { formatIdentifier } from "metabase/querying/expressions/identifier";
import * as Lib from "metabase-lib";

import type { SummaryBase } from "../../../../components/view/SummarySidebar/types";

import type { SummaryFieldItem } from "./SummaryFieldList";

export type FormulaExpressionMode = "aggregation" | "expression";

/** The open formula editor, as the field list sees it while in point mode. */
export type ActiveFormulaEditor = {
  expressionMode: FormulaExpressionMode;
  /** The color class of each column or metric the draft references, by its reference key. */
  referenceColorClassNames: ReadonlyMap<string, string>;
  /** Puts `text` at the cursor, replacing the selection (or the reference just pointed at), and refocuses. */
  insert: (text: string) => void;
};

type SetActiveFormulaEditor = (
  update: (editor: ActiveFormulaEditor | null) => ActiveFormulaEditor | null,
) => void;

const ActiveFormulaEditorContext = createContext<SetActiveFormulaEditor>(
  () => {},
);

export const ActiveFormulaEditorProvider = ActiveFormulaEditorContext.Provider;

/** Makes `editor` the one the field list inserts into, for as long as it's mounted. */
export function useRegisterActiveFormulaEditor(editor: ActiveFormulaEditor) {
  const setActiveEditor = useContext(ActiveFormulaEditorContext);
  useEffect(() => {
    setActiveEditor(() => editor);
    return () =>
      setActiveEditor((activeEditor) =>
        activeEditor === editor ? null : activeEditor,
      );
  }, [editor, setActiveEditor]);
}

/** How a column or metric name is matched against the references in a formula. */
export function getReferenceKey(name: string): string {
  return name.trim().toLowerCase();
}

/** The name a field goes by in a formula, as the editor's completions name it. */
function getFieldReferenceName(
  { query, stageIndex }: SummaryBase,
  item: Exclude<SummaryFieldItem, { kind: "count" }>,
): string {
  return item.kind === "column"
    ? Lib.displayInfo(query, stageIndex, item.column).longDisplayName
    : Lib.displayInfo(query, stageIndex, item.metric).longDisplayName;
}

/**
 * What clicking a field inserts into a formula: its bracketed reference, or `Count()` for the
 * count. `null` when the formula can't use it: metrics and the count only aggregate.
 */
export function getFieldReference(
  base: SummaryBase,
  item: SummaryFieldItem,
  expressionMode: FormulaExpressionMode,
): string | null {
  if (item.kind !== "column" && expressionMode !== "aggregation") {
    return null;
  }
  return item.kind === "count"
    ? "Count()"
    : formatIdentifier(getFieldReferenceName(base, item));
}

/** The color class of the field's references in the open formula, if it has any. */
export function getFieldReferenceColorClassName(
  base: SummaryBase,
  item: SummaryFieldItem,
  editor: ActiveFormulaEditor,
): string | undefined {
  if (item.kind === "count") {
    return undefined;
  }
  return editor.referenceColorClassNames.get(
    getReferenceKey(getFieldReferenceName(base, item)),
  );
}
