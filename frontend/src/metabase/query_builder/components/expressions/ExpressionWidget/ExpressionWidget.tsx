import type { ReactNode } from "react";
import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import { isNotNull } from "metabase/lib/types";
import type {
  DefinedClauseName,
  ExpressionError,
} from "metabase/querying/expressions";
import { Box, Button, Flex } from "metabase/ui";
import type * as Lib from "metabase-lib";

import {
  trackColumnCombineViaShortcut,
  trackColumnExtractViaShortcut,
} from "../../../analytics";
import { CombineColumns, hasCombinations } from "../CombineColumns";
import { Editor } from "../Editor";
import type { Shortcut } from "../Editor/Shortcuts";
import { ExtractColumn, hasExtractions } from "../ExtractColumn";
import { Layout, LayoutFooter, LayoutHeader } from "../Layout";
import { NameInput } from "../NameInput";

const WIDGET_WIDTH = 472;

export type ExpressionWidgetProps = {
  expressionMode?: Lib.ExpressionMode;

  query: Lib.Query;
  stageIndex: number;
  expressionIndex?: number;
  clause?: Lib.Expressionable | undefined;
  name?: string;
  withName?: boolean;
  reportTimezone?: string;
  header?: ReactNode;
  initialExpressionClause?: DefinedClauseName | null;
  availableColumns: Lib.ColumnMetadata[];
  availableMetrics?: Lib.MetricMetadata[];
  readOnly?: boolean;

  onChangeClause?: (name: string, clause: Lib.ExpressionClause) => void;
  onClose?: () => void;
};

export const ExpressionWidget = (props: ExpressionWidgetProps) => {
  const {
    query,
    stageIndex,
    expressionIndex,
    name: initialName,
    clause: initialClause,
    withName = false,
    expressionMode = "expression",
    reportTimezone,
    header,
    availableColumns,
    availableMetrics,
    onChangeClause,
    onClose,
    initialExpressionClause,
    readOnly,
  } = props;

  const [name, setName] = useState(initialName || "");
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

  const handleCancel = useCallback(() => {
    setIsCombiningColumns(false);
    setIsExtractingColumn(false);
  }, []);

  if (expressionMode === "expression" && isCombiningColumns) {
    return (
      <Box w={WIDGET_WIDTH} data-testid="expression-editor">
        <CombineColumns
          query={query}
          stageIndex={stageIndex}
          availableColumns={availableColumns}
          onCancel={handleCancel}
          onSubmit={handleCombineColumnsSubmit}
          withTitle
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
          availableColumns={availableColumns}
          onCancel={handleCancel}
          onSubmit={handleExtractColumnSubmit}
        />
      </Box>
    );
  }

  return (
    <Layout data-testid="expression-editor" data-ignore-editor-clicks="true">
      {header && <LayoutHeader>{header}</LayoutHeader>}

      <Editor
        id="expression-content"
        expressionMode={expressionMode}
        clause={clause}
        initialClause={initialClause}
        onChange={handleExpressionChange}
        query={query}
        stageIndex={stageIndex}
        expressionIndex={expressionIndex}
        availableColumns={availableColumns}
        availableMetrics={availableMetrics}
        reportTimezone={reportTimezone}
        shortcuts={shortcuts}
        error={error}
        hasHeader={Boolean(header)}
        onCloseEditor={onClose}
        initialExpressionClause={initialExpressionClause}
        readOnly={readOnly}
      />

      <LayoutFooter>
        <Flex gap="xs" align="center" justify="end" p="0" pr="sm">
          {withName && (
            <NameInput
              value={name}
              onChange={setName}
              onSubmit={handleSubmit}
              expressionMode={expressionMode}
              readOnly={readOnly}
            />
          )}
          <Flex py="sm" pr="sm" gap="sm">
            {onClose && !readOnly && (
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
            >
              {(initialName || initialClause) && !readOnly
                ? t`Update`
                : t`Done`}
            </Button>
          </Flex>
        </Flex>
      </LayoutFooter>
    </Layout>
  );
};
