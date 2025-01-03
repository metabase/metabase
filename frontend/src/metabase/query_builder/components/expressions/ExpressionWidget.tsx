import type { ReactNode } from "react";
import { useState } from "react";
import { t } from "ttag";

import DeprecatedButton from "metabase/core/components/Button";
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
import {
  ExpressionEditorTextfield,
  type SuggestionShortcut,
} from "./ExpressionEditorTextfield";
import ExpressionWidgetS from "./ExpressionWidget.module.css";
import { ExpressionWidgetHeader } from "./ExpressionWidgetHeader";
import { ExpressionWidgetInfo } from "./ExpressionWidgetInfo";
import { ExtractColumn, hasExtractions } from "./ExtractColumn";

const WIDGET_WIDTH = 472;

export type ExpressionWidgetProps<Clause = Lib.ExpressionClause> = {
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
  clause?: Clause | undefined;
  name?: string;
  withName?: boolean;
  startRule?: "expression" | "aggregation" | "boolean";
  reportTimezone?: string;
  header?: ReactNode;
  expressionIndex?: number;

  onChangeExpression?: (name: string, expression: Expression) => void;
  onChangeClause?: (
    name: string,
    clause: Clause | Lib.ExpressionClause,
  ) => void;
  onRemoveExpression?: (name: string) => void;
  onClose?: () => void;
};

export const ExpressionWidget = <Clause extends object = Lib.ExpressionClause>(
  props: ExpressionWidgetProps<Clause>,
): JSX.Element => {
  const {
    query,
    stageIndex,
    name: initialName,
    expression: initialExpression,
    clause: initialClause,
    withName = false,
    startRule,
    reportTimezone,
    header,
    expressionIndex,
    onChangeExpression,
    onChangeClause,
    onRemoveExpression,
    onClose,
  } = props;

  const [name, setName] = useState(initialName || "");
  const [expression, setExpression] = useState<Expression | null>(
    initialExpression ?? null,
  );
  const [clause, setClause] = useState<Clause | Lib.ExpressionClause | null>(
    initialClause ?? null,
  );
  const [error, setError] = useState<string | null>(null);
  const [isCombiningColumns, setIsCombiningColumns] = useState(false);

  const [isExtractingColumn, setIsExtractingColumn] = useState(false);

  const isValidName = withName ? name.trim().length > 0 : true;
  const isValidExpression = isNotNull(expression) && isExpression(expression);
  const isValidExpressionClause = isNotNull(clause);
  const isValid =
    !error && isValidName && (isValidExpression || isValidExpressionClause);

  const handleCommit = (
    expression: Expression | null,
    clause: Clause | Lib.ExpressionClause | null,
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

  const handleError = (error: ErrorWithMessage | string | null) => {
    if (error) {
      setError(typeof error === "string" ? error : error.message);
    }
  };

  const handleExpressionChange = (
    expression: Expression | null,
    clause: Lib.ExpressionClause | null,
  ) => {
    setExpression(expression);
    setClause(clause);
    setError(null);
  };

  if (isCombiningColumns) {
    const handleSubmit = (name: string, clause: Lib.ExpressionClause) => {
      trackColumnCombineViaShortcut(query);
      const expression = Lib.legacyExpressionForExpressionClause(
        query,
        stageIndex,
        clause,
      );
      handleExpressionChange(expression, clause);
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
      handleExpressionChange(expression, clause);
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
        <ExpressionEditorTextfield
          expression={expression}
          expressionIndex={expressionIndex}
          /**
           * TODO: Ideally ExpressionEditorTextfield should be generic and support all
           * three: Lib.ExpressionClause, Lib.AggregationClause, and Lib.FilterableClause.
           */
          clause={clause as Lib.ExpressionClause | null}
          startRule={startRule}
          name={name}
          query={query}
          stageIndex={stageIndex}
          reportTimezone={reportTimezone}
          textAreaId="expression-content"
          onChange={handleExpressionChange}
          onCommit={handleCommit}
          onError={handleError}
          shortcuts={[
            !startRule &&
              hasCombinations(query, stageIndex) && {
                shortcut: true,
                name: t`Combine columns`,
                action: () => setIsCombiningColumns(true),
                group: "shortcuts",
                icon: "combine",
              },
            !startRule &&
              hasExtractions(query, stageIndex) && {
                shortcut: true,
                name: t`Extract columns`,
                icon: "arrow_split",
                group: "shortcuts",
                action: () => setIsExtractingColumn(true),
              },
          ].filter((shortcut): shortcut is SuggestionShortcut => {
            return Boolean(shortcut);
          })}
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

          {initialName && onRemoveExpression ? (
            <DeprecatedButton
              className={ExpressionWidgetS.RemoveLink}
              onlyText
              onClick={() => {
                onRemoveExpression(initialName);
                onClose && onClose();
              }}
            >{t`Remove`}</DeprecatedButton>
          ) : null}
        </Flex>
      </Flex>
    </Box>
  );
};
