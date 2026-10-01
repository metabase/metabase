import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import type { ExpressionError } from "metabase/querying/expressions";
import { isNotNull } from "metabase/utils/types";
import type * as Lib from "metabase-lib";

import {
  trackColumnCombineViaShortcut,
  trackColumnExtractViaShortcut,
} from "../../../analytics";
import { hasCombinations } from "../CombineColumns";
import type { Shortcut } from "../Editor/Shortcuts";
import { hasExtractions } from "../ExtractColumn";

export type UseExpressionEditorProps = {
  query: Lib.Query;
  stageIndex: number;
  expressionMode: Lib.ExpressionMode;
  availableColumns: Lib.ColumnMetadata[];
  name?: string;
  clause?: Lib.Expressionable;
  withName?: boolean;

  onChangeClause?: (name: string, clause: Lib.ExpressionClause) => void;
  onClose?: () => void;
};

/**
 * The state behind a custom expression editor, with no opinion on how it is
 * presented. The popover widget and the notebook's inline editor share it so
 * that validation, naming and the combine/extract shortcuts behave identically
 * in both.
 */
export function useExpressionEditor({
  query,
  stageIndex,
  expressionMode,
  availableColumns,
  name: initialName,
  clause: initialClause,
  withName = false,
  onChangeClause,
  onClose,
}: UseExpressionEditorProps) {
  const [name, setName] = useState(initialName || "");

  // `diagnoseAndCompile` brands every clause it produces as an ExpressionClause,
  // whatever the expression mode, and callers re-brand at their own boundary. So
  // the editor's working type is ExpressionClause and seeding it from an
  // existing filter or aggregation clause is a rebrand of the same MBQL clause.
  const [clause, setClause] = useState<Lib.ExpressionClause | null>(
    (initialClause ?? null) as Lib.ExpressionClause | null,
  );
  const [error, setError] = useState<ExpressionError | null>(null);

  const [isCombiningColumns, setIsCombiningColumns] = useState(false);
  const [isExtractingColumn, setIsExtractingColumn] = useState(false);

  const isValidName = withName ? name.trim().length > 0 : true;
  const isValidExpressionClause = isNotNull(clause);
  const isValid = !error && isValidName && isValidExpressionClause;

  const handleCommit = useCallback(
    (clause: Lib.ExpressionClause | null) => {
      const isValidExpressionClause = isNotNull(clause);
      const isValid = !error && isValidName && isValidExpressionClause;

      if (!isValid) {
        return;
      }

      onChangeClause?.(name, clause);
      onClose?.();
    },
    [name, isValidName, error, onChangeClause, onClose],
  );

  const handleSubmit = useCallback(() => {
    handleCommit(clause);
  }, [clause, handleCommit]);

  const handleExpressionChange = useCallback(
    (
      clause: Lib.ExpressionClause | null,
      error: ExpressionError | null = null,
    ) => {
      if (error) {
        setError(error);
        return;
      } else {
        setClause(clause);
        setError(null);
      }
    },
    [],
  );

  const shortcuts = useMemo(
    () =>
      [
        expressionMode === "expression" &&
          hasCombinations(availableColumns) && {
            name: t`Combine columns`,
            icon: "combine",
            action: () => setIsCombiningColumns(true),
          },
        expressionMode === "expression" &&
          hasExtractions(query, availableColumns) && {
            name: t`Extract columns`,
            icon: "arrow_split",
            action: () => setIsExtractingColumn(true),
          },
      ].filter((x): x is Shortcut => Boolean(x)),
    [expressionMode, query, availableColumns],
  );

  const handleCombineColumnsSubmit = useCallback(
    (name: string, clause: Lib.ExpressionClause) => {
      trackColumnCombineViaShortcut(query);
      handleExpressionChange(clause);
      setName(name);
      setIsCombiningColumns(false);
    },
    [query, handleExpressionChange],
  );

  const handleExtractColumnSubmit = useCallback(
    (
      clause: Lib.ExpressionClause,
      name: string,
      extraction: Lib.ColumnExtraction,
    ) => {
      trackColumnExtractViaShortcut(query, stageIndex, extraction);
      handleExpressionChange(clause);
      setName(name);
      setIsExtractingColumn(false);
    },
    [query, stageIndex, handleExpressionChange],
  );

  const handleCancelSubScreen = useCallback(() => {
    setIsCombiningColumns(false);
    setIsExtractingColumn(false);
  }, []);

  return {
    name,
    setName,
    clause,
    error,
    isValid,
    shortcuts,
    isCombiningColumns,
    isExtractingColumn,
    handleExpressionChange,
    handleSubmit,
    handleCombineColumnsSubmit,
    handleExtractColumnSubmit,
    handleCancelSubScreen,
  };
}
