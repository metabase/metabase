import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { isNotNull } from "metabase/lib/types";
import { Box, Button, Flex, TextInput } from "metabase/ui";
import * as Lib from "metabase-lib";
import { isExpression } from "metabase-lib/v1/expressions";
import type { ErrorWithMessage } from "metabase-lib/v1/expressions/types";
import type { Expression } from "metabase-types/api";

import {
  trackColumnCombineViaShortcut,
  trackColumnExtractViaShortcut,
} from "../../analytics";

import { CombineColumns, hasCombinations } from "./CombineColumns";
import { Editor, type Shortcut } from "./Editor";
import ExpressionWidgetS from "./ExpressionWidget.module.css";
import { ExpressionWidgetHeader } from "./ExpressionWidgetHeader";
import { ExpressionWidgetInfo } from "./ExpressionWidgetInfo";
import { ExtractColumn, hasExtractions } from "./ExtractColumn";
import type { ClauseType, StartRule } from "./types";

const WIDGET_WIDTH = 472;

export type ExpressionWidgetProps<S extends StartRule = "expression"> = {
  startRule?: S;

  query: Lib.Query;
  stageIndex: number;
  /**
   * expression should not be present in components migrated to MLv2
   */
  expression?: Expression | undefined;
  /**
   * Presence of this prop is not enforced due to backwards-compatibility
   * with ExpressionWidget usages outside of GUI editor.
   */
  clause?: ClauseType<S> | undefined;
  name?: string;
  withName?: boolean;
  reportTimezone?: string;
  header?: ReactNode;
  expressionIndex?: number;

  onChangeExpression?: (name: string, expression: Expression) => void;
  onChangeClause?: (name: string, clause: ClauseType<S>) => void;
  onClose?: () => void;
};

export const ExpressionWidget = <S extends StartRule = "expression">(
  props: ExpressionWidgetProps<S>,
) => {
  type Clause = ClauseType<S>;

  const {
    query,
    stageIndex,
    name: initialName,
    expression: initialExpression,
    clause: initialClause,
    withName = false,
    startRule = "expression",
    reportTimezone,
    header,
    expressionIndex,
    onChangeExpression,
    onChangeClause,
    onClose,
  } = props;

  const [name, setName] = useState(initialName || "");
  const [expression, setExpression] = useState<Expression | null>(
    initialExpression ?? null,
  );
  const [clause, setClause] = useState<Clause | null>(initialClause ?? null);
  const [error, setError] = useState<ErrorWithMessage | null>(null);
  const [isCombiningColumns, setIsCombiningColumns] = useState(false);

  const [isExtractingColumn, setIsExtractingColumn] = useState(false);

  const isValidName = withName ? name.trim().length > 0 : true;
  const isValidExpression = isNotNull(expression) && isExpression(expression);
  const isValidExpressionClause = isNotNull(clause);
  const isValid =
    !error && isValidName && (isValidExpression || isValidExpressionClause);

  const handleCommit = (
    expression: Expression | null,
    clause: Clause | null,
  ) => {
    const isValidExpression = isNotNull(expression) && isExpression(expression);
    const isValidExpressionClause = isNotNull(clause);
    const isValid =
      !error && isValidName && (isValidExpression || isValidExpressionClause);

    if (!isValid) {
      return;
    }

    if (isValidExpression) {
      onChangeExpression?.(name, expression);
      onClose?.();
    }

    if (isValidExpressionClause) {
      onChangeClause?.(name, clause);
      onClose?.();
    }
  };

  const handleError = (error: ErrorWithMessage | null) => {
    setError(error);
  };

  const handleExpressionChange = (
    expression: Expression | null,
    clause: Clause | null,
  ) => {
    setExpression(expression);
    setClause(clause);
    setError(null);
  };

  const shortcuts = useMemo(
    () =>
      [
        startRule === "expression" &&
          hasCombinations(query, stageIndex) && {
            name: t`Combine columns`,
            icon: "combine",
            action: () => setIsCombiningColumns(true),
          },
        startRule === "expression" &&
          hasExtractions(query, stageIndex) && {
            name: t`Extract columns`,
            icon: "arrow_split",
            action: () => setIsExtractingColumn(true),
          },
      ].filter((x): x is Shortcut => Boolean(x)),
    [startRule, query, stageIndex],
  );

  if (startRule === "expression" && isCombiningColumns) {
    const handleSubmit = (name: string, clause: Lib.ExpressionClause) => {
      trackColumnCombineViaShortcut(query);
      const expression = Lib.legacyExpressionForExpressionClause(
        query,
        stageIndex,
        clause,
      );
      handleExpressionChange(expression, clause as Clause);
      setName(name);
      setIsCombiningColumns(false);
    };

    const handleCancel = () => {
      setIsCombiningColumns(false);
    };

    return (
      <Box w={WIDGET_WIDTH} data-testid="expression-editor">
        <ExpressionWidgetHeader
          title={t`Select columns to combine`}
          onBack={handleCancel}
        />
        <CombineColumns
          query={query}
          stageIndex={stageIndex}
          onSubmit={handleSubmit}
        />
      </Box>
    );
  }

  if (isExtractingColumn) {
    const handleSubmit = (
      clause: Lib.ExpressionClause,
      name: string,
      extraction: Lib.ColumnExtraction,
    ) => {
      trackColumnExtractViaShortcut(query, stageIndex, extraction);
      const expression = Lib.legacyExpressionForExpressionClause(
        query,
        stageIndex,
        clause,
      );
      handleExpressionChange(expression, clause as Clause);
      setName(name);
      setIsExtractingColumn(false);
    };

    return (
      <Box w={WIDGET_WIDTH} data-testid="expression-editor">
        <ExtractColumn
          query={query}
          stageIndex={stageIndex}
          onCancel={() => setIsExtractingColumn(false)}
          onSubmit={handleSubmit}
        />
      </Box>
    );
  }

  return (
    <Box w={WIDGET_WIDTH} data-testid="expression-editor">
      {header}
      <Box p="1.5rem 1.5rem 1rem">
        <Box
          component="label"
          className={ExpressionWidgetS.FieldLabel}
          htmlFor="expression-content"
        >
          {t`Expression`}
          <ExpressionWidgetInfo />
        </Box>
        <Editor
          id="expression-content"
          expression={expression}
          expressionIndex={expressionIndex}
          startRule={startRule as S}
          clause={clause}
          name={name}
          query={query}
          stageIndex={stageIndex}
          reportTimezone={reportTimezone}
          onChange={handleExpressionChange}
          onCommit={handleCommit}
          error={error}
          onError={handleError}
          shortcuts={shortcuts}
        />
      </Box>
      {withName && (
        <Box p="0 1.5rem 1.5rem">
          <Box
            component="label"
            className={ExpressionWidgetS.FieldLabel}
            htmlFor="expression-name"
          >{t`Name`}</Box>
          <TextInput
            classNames={{
              input: CS.textBold,
            }}
            id="expression-name"
            data-testid="expression-name"
            type="text"
            value={name}
            placeholder={t`Something nice and descriptive`}
            w="100%"
            radius="md"
            onChange={event => setName(event.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") {
                handleCommit(expression, clause);
              }
            }}
          />
        </Box>
      )}

      <Flex className={ExpressionWidgetS.Footer}>
        <Flex ml="auto" gap="md">
          {onClose && <Button onClick={onClose}>{t`Cancel`}</Button>}
          <Button
            variant={isValid ? "filled" : "default"}
            disabled={!isValid}
            onClick={() => handleCommit(expression, clause)}
          >
            {initialName ? t`Update` : t`Done`}
          </Button>
        </Flex>
      </Flex>
    </Box>
  );
};
