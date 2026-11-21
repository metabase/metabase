import { useEffect, useMemo, useState } from "react";
import { useMountedState } from "react-use";
import { t } from "ttag";

import { getTooltipPosition } from "metabase/querying/components/expressions/Editor";
import { Tooltip } from "metabase/querying/components/expressions/Editor/Tooltip";
import { useCustomTooltip } from "metabase/querying/components/expressions/Editor/custom-tooltip";
import { useExtensions } from "metabase/querying/components/expressions/Editor/extensions";
import { diagnoseAndCompile, format } from "metabase/querying/expressions";
import * as Lib from "metabase-lib";

import { parenPairDeletion } from "./formula-parens";
import { formulaTokens } from "./formula-tokens";
import type { FormulaEditorProps } from "./types";
import { useFormulaKeymap } from "./use-formula-keymap";
import { useFormulaSource } from "./use-formula-source";
import { getDefaultFormulaName, getFormulaColumns } from "./utils";

export function useFormulaEditor(props: FormulaEditorProps) {
  const {
    query,
    stageIndex,
    database,
    expressionMode,
    expressionIndex,
    initialSource,
    initialName,
    sourceStatus = "ready",
    onEditorCreate,
    onNameChange,
    onSubmit,
    onCancel,
  } = props;
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isMounted = useMountedState();
  const availableColumns = useMemo(
    () => getFormulaColumns(query, stageIndex, expressionMode, expressionIndex),
    [query, stageIndex, expressionMode, expressionIndex],
  );
  const availableMetrics = useMemo(
    () =>
      expressionMode === "aggregation"
        ? Lib.availableMetrics(query, stageIndex)
        : undefined,
    [query, stageIndex, expressionMode],
  );
  const { source, handleChange, handleCreate } = useFormulaSource({
    initialSource,
    onEditorCreate,
    onChange: () => setErrorMessage(null),
  });
  const hasFormula = source.trim().length > 0 && sourceStatus === "ready";
  const formulaName = initialName?.trim() || getDefaultFormulaName(source);

  useEffect(() => {
    onNameChange?.(formulaName, source);
  }, [formulaName, source, onNameChange]);

  const getClause = (): Lib.ExpressionClause | null => {
    if (!hasFormula) {
      return null;
    }
    const { error, expressionClause } = diagnoseAndCompile({
      source: source.trim(),
      expressionMode,
      query,
      stageIndex,
      expressionIndex,
      database,
      availableColumns,
      availableMetrics,
    });
    if (error || expressionClause == null) {
      setErrorMessage(error?.message ?? t`This formula isn't valid.`);
      return null;
    }
    return expressionClause;
  };

  // names the formula after its formatted text, which is what `isDefaultFormulaName` compares names with.
  const handleSubmit = () => {
    if (isSubmitting || sourceStatus !== "ready") {
      return;
    }
    const clause = getClause();
    if (clause === null) {
      return;
    }
    setIsSubmitting(true);
    format(clause, { query, stageIndex, printWidth: Infinity })
      .catch(() => source)
      .then((formula) => {
        if (isMounted()) {
          setIsSubmitting(false);
          onSubmit({
            name: initialName?.trim() || getDefaultFormulaName(formula),
            clause,
            source: source.trim(),
          });
        }
      });
  };
  const keys = useFormulaKeymap({
    onSubmit: handleSubmit,
    onCancel,
  });
  const [completionTooltip, completionTooltipPortal] = useCustomTooltip({
    getPosition: getTooltipPosition,
    render: (tooltipProps) => (
      <Tooltip
        query={query}
        stageIndex={stageIndex}
        database={database}
        expressionMode={expressionMode}
        {...tooltipProps}
      />
    ),
  });
  const tokens = useMemo(() => formulaTokens(), []);
  const extensions = useExtensions({
    expressionMode,
    query,
    stageIndex,
    availableColumns,
    availableMetrics,
    database,
    extensions: [completionTooltip, keys, tokens, parenPairDeletion],
  });

  return {
    source,
    hasFormula,
    isSubmitting,
    errorMessage:
      sourceStatus === "failed"
        ? t`Couldn't load this formula. Please, close it and try again.`
        : errorMessage,
    extensions,
    completionTooltipPortal,
    handleChange,
    handleCreate,
    handleSubmit,
  };
}
