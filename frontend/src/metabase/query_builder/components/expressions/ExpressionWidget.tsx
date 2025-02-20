import type {
  ChangeEvent,
  KeyboardEvent as ReactKeyboardEvent,
  ReactNode,
} from "react";
import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import { isNotNull } from "metabase/lib/types";
import { Box, Button, Flex, TextInput } from "metabase/ui";
import type * as Lib from "metabase-lib";
import type { Shortcut } from "metabase-lib/v1/expressions/complete";
import type { ErrorWithMessage } from "metabase-lib/v1/expressions/types";

import {
  trackColumnCombineViaShortcut,
  trackColumnExtractViaShortcut,
} from "../../analytics";

import { CombineColumns, hasCombinations } from "./CombineColumns";
import { Editor } from "./Editor";
import S from "./ExpressionWidget.module.css";
import { ExpressionWidgetHeader } from "./ExpressionWidgetHeader";
import { ExtractColumn, hasExtractions } from "./ExtractColumn";
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

  const handleNameChange = useCallback((evt: ChangeEvent<HTMLInputElement>) => {
    setName(evt.target.value);
  }, []);

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
    (evt: ReactKeyboardEvent<HTMLInputElement>) => {
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
        shortcuts={shortcuts}
      />

      <Flex gap="xs" align="center">
        {withName && (
          <TextInput
            id="expression-name"
            data-testid="expression-name"
            type="text"
            value={name}
            placeholder={t`Give your column a name...`}
            onChange={handleNameChange}
            onKeyDown={handleKeyDown}
            style={{ flexGrow: 1 }}
            classNames={{ input: S.nameInput }}
          />
        )}

        {onClose && (
          <Button
            onClick={onClose}
            variant="subtle"
            size="xs"
          >{t`Cancel`}</Button>
        )}
        <Button
          variant="filled"
          disabled={!isValid}
          onClick={handleSubmit}
          size="xs"
          mr="sm"
        >
          {initialName ? t`Update` : t`Done`}
        </Button>
      </Flex>
    </Box>
  );
};
