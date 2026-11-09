import type { ReactNode } from "react";
import { t } from "ttag";

import { Box, Button, Flex } from "metabase/ui";
import type * as Lib from "metabase-lib";

import { CombineColumns } from "../CombineColumns";
import { Editor } from "../Editor";
import { ExtractColumn } from "../ExtractColumn";
import { Layout, LayoutFooter, LayoutHeader } from "../Layout";
import { NameInput } from "../NameInput";

import { useExpressionEditor } from "./use-expression-editor";

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
  initialExpressionClause?: Lib.DefinedClauseName | null;
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

  const {
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
  } = useExpressionEditor({
    query,
    stageIndex,
    expressionMode,
    availableColumns,
    name: initialName,
    clause: initialClause,
    withName,
    onChangeClause,
    onClose,
  });

  if (expressionMode === "expression" && isCombiningColumns) {
    return (
      <Box w={WIDGET_WIDTH} data-testid="expression-editor">
        <CombineColumns
          query={query}
          stageIndex={stageIndex}
          availableColumns={availableColumns}
          onCancel={handleCancelSubScreen}
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
          onCancel={handleCancelSubScreen}
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
        <Flex gap="xxs" align="center" justify="end" p="0" pr="sm">
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
                color="neutral"
              >{t`Cancel`}</Button>
            )}
            <Button variant="filled" disabled={!isValid} onClick={handleSubmit}>
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
