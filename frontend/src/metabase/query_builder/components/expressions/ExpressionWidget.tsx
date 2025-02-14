import type { ReactNode } from "react";
import { useCallback, useState } from "react";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { isNotNull } from "metabase/lib/types";
import { Box, Button, Flex, TextInput } from "metabase/ui";
import type * as Lib from "metabase-lib";
import type { ErrorWithMessage } from "metabase-lib/v1/expressions/types";

import {
  trackColumnCombineViaShortcut,
  trackColumnExtractViaShortcut,
} from "../../analytics";

import { CombineColumns } from "./CombineColumns";
import { Editor } from "./Editor";
import ExpressionWidgetS from "./ExpressionWidget.module.css";
import { ExpressionWidgetHeader } from "./ExpressionWidgetHeader";
import { ExpressionWidgetInfo } from "./ExpressionWidgetInfo";
import { ExtractColumn } from "./ExtractColumn";
import type { ClauseType, StartRule } from "./types";

const WIDGET_WIDTH = 472;

export type ExpressionWidgetProps<S extends StartRule = "expression"> = {
  startRule?: S;

  query: Lib.Query;
  stageIndex: number;
  clause?: ClauseType<S> | undefined;
  name?: string;
  withName?: boolean;
  reportTimezone?: string;
  header?: ReactNode;
  expressionIndex?: number;

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
    clause: initialClause,
    withName = false,
    startRule = "expression",
    reportTimezone,
    header,
    expressionIndex,
    onChangeClause,
    onClose,
  } = props;

  const [name, setName] = useState(initialName || "");
  const [clause, setClause] = useState<Clause | null>(initialClause ?? null);
  const [error, setError] = useState<ErrorWithMessage | null>(null);

  const [isCombiningColumns, setIsCombiningColumns] = useState(false);
  const [isExtractingColumn, setIsExtractingColumn] = useState(false);

  const isValidName = withName ? name.trim().length > 0 : true;
  const isValidExpressionClause = isNotNull(clause);
  const isValid = !error && isValidName && isValidExpressionClause;

  const handleCommit = useCallback(
    (clause: Clause | null) => {
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

  const handleError = useCallback((error: ErrorWithMessage | null) => {
    setError(error);
  }, []);

  const handleExpressionChange = useCallback((clause: Clause | null) => {
    setClause(clause);
    setError(null);
  }, []);

  const handleNameChange = useCallback(
    (evt: React.ChangeEvent<HTMLInputElement>) => {
      setName(evt.target.value);
    },
    [],
  );

  const handleCombineColumnsSubmit = useCallback(
    (name: string, clause: Lib.ExpressionClause) => {
      trackColumnCombineViaShortcut(query);
      handleExpressionChange(clause as Clause);
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
      handleExpressionChange(clause as Clause);
      setName(name);
      setIsExtractingColumn(false);
    },
    [query, stageIndex, handleExpressionChange],
  );

  const handleCancel = useCallback(() => {
    setIsCombiningColumns(false);
    setIsExtractingColumn(false);
  }, []);

  const handleKeyDown = useCallback(
    (evt: React.KeyboardEvent<HTMLInputElement>) => {
      if (evt.key === "Enter") {
        handleCommit(clause);
      }
    },
    [handleCommit, clause],
  );

  if (startRule === "expression" && isCombiningColumns) {
    return (
      <Box w={WIDGET_WIDTH} data-testid="expression-editor">
        <ExpressionWidgetHeader
          title={t`Select columns to combine`}
          onBack={handleCancel}
        />
        <CombineColumns
          query={query}
          stageIndex={stageIndex}
          onSubmit={handleCombineColumnsSubmit}
        />
      </Box>
    );
  }

  if (isExtractingColumn) {
    return (
      <Box w={WIDGET_WIDTH} data-testid="expression-editor">
        <ExtractColumn
          query={query}
          stageIndex={stageIndex}
          onCancel={handleCancel}
          onSubmit={handleExtractColumnSubmit}
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
        />
      </Box>

      {withName && (
        <Box p="0 1.5rem 1.5rem">
          <Box
            component="label"
            className={ExpressionWidgetS.FieldLabel}
            htmlFor="expression-name"
          >
            {t`Name`}
          </Box>
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
            onChange={handleNameChange}
            onKeyDown={handleKeyDown}
          />
        </Box>
      )}

      <Flex className={ExpressionWidgetS.Footer}>
        <Flex ml="auto" gap="md">
          {onClose && <Button onClick={onClose}>{t`Cancel`}</Button>}
          <Button variant="filled" disabled={!isValid} onClick={handleSubmit}>
            {initialName ? t`Update` : t`Done`}
          </Button>
        </Flex>
      </Flex>
    </Box>
  );
};
