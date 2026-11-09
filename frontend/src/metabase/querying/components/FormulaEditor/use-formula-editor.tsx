import { useEffect, useMemo, useState } from "react";
import { useLatest } from "react-use";
import { t } from "ttag";

import { getTooltipPosition } from "metabase/querying/components/expressions/Editor";
import { Tooltip } from "metabase/querying/components/expressions/Editor/Tooltip";
import { useCustomTooltip } from "metabase/querying/components/expressions/Editor/custom-tooltip";
import { useExtensions } from "metabase/querying/components/expressions/Editor/extensions";
import { diagnoseAndCompile } from "metabase/querying/expressions";
import * as Lib from "metabase-lib";

import { parenPairDeletion } from "./formula-parens";
import { formulaTokens } from "./formula-tokens";
import type { FormulaEditorProps, NamedExpression } from "./types";
import { useFormulaKeymap } from "./use-formula-keymap";
import { useFormulaSource } from "./use-formula-source";
import { getDefaultFormulaName, getFormulaColumns } from "./utils";

export function useFormulaEditor(props: FormulaEditorProps) {
  const {
    query,
    stageIndex,
    database,
    expressionMode,
    initialClause,
    initialSource,
    initialName = "",
    onEditorCreate,
    onNameChange,
    onSubmit,
    onCancel,
    onNavigate,
  } = props;
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const availableColumns = useMemo(
    () => getFormulaColumns(query, stageIndex, expressionMode),
    [query, stageIndex, expressionMode],
  );
  const availableMetrics = useMemo(
    () =>
      expressionMode === "aggregation"
        ? Lib.availableMetrics(query, stageIndex)
        : undefined,
    [query, stageIndex, expressionMode],
  );
  const { source, hasTyped, handleChange, handleCreate } = useFormulaSource({
    query,
    stageIndex,
    initialClause,
    initialSource,
    availableColumns,
    onEditorCreate,
    onChange: () => setErrorMessage(null),
  });
  const hasFormula = source.trim().length > 0;
  const formulaName = initialName.trim() || getDefaultFormulaName(source);
  const liveName = hasFormula ? formulaName : "";
  const nameChangeRef = useLatest(onNameChange);
  useEffect(() => {
    nameChangeRef.current?.(liveName);
  }, [liveName, nameChangeRef]);

  const getExpression = (): NamedExpression | null => {
    if (!hasFormula) {
      return null;
    }
    const { error, expressionClause } = diagnoseAndCompile({
      source: source.trim(),
      expressionMode,
      query,
      stageIndex,
      database,
      availableColumns,
      availableMetrics,
    });
    if (error || expressionClause == null) {
      setErrorMessage(error?.message ?? t`This formula isn't valid.`);
      return null;
    }
    return {
      name: formulaName,
      clause: expressionClause,
    };
  };
  const handleSubmit = () => {
    const expression = getExpression();
    if (expression !== null) {
      onSubmit(expression);
    }
  };
  const handleNavigate = (direction: "backward" | "forward") => {
    if (!onNavigate) {
      return false;
    }
    if (!hasTyped.current) {
      return onNavigate(direction, null);
    }
    const expression = getExpression();
    return expression === null || onNavigate(direction, expression);
  };
  const keys = useFormulaKeymap({
    onSubmit: handleSubmit,
    onCancel,
    onNavigate: handleNavigate,
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
    errorMessage,
    extensions,
    completionTooltipPortal,
    handleChange,
    handleCreate,
    handleSubmit,
  };
}
