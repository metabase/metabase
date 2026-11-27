import { type ReactNode, useRef } from "react";
import { t } from "ttag";

import { Box, Button, Flex } from "metabase/ui";
import type * as Lib from "metabase-lib";

import { InlineExpressionEditorF } from "../../../notebook/components/InlineExpressionEditorF";
import { CombineColumns } from "../CombineColumns";
import { Editor } from "../Editor";
import { ExtractColumn } from "../ExtractColumn";
import { Layout, LayoutFooter, LayoutHeader } from "../Layout";
import { NameInput } from "../NameInput";

import S from "./ExpressionWidget.module.css";
import { useExpressionEditor } from "./use-expression-editor";

const WIDGET_WIDTH = 472;
const USE_NEW_EDITOR = true;

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

  // The new editor saves each valid edit. Here the edits stay in the popover
  // until Done, so that the question does not run on each edit.
  const committedRef = useRef<Lib.ExpressionClause | undefined>(undefined);
  const handleNewEditorCommit = (
    clause: Lib.ExpressionClause,
    acceptedName?: string,
    options?: { forceName?: boolean },
  ) => {
    committedRef.current = clause;
    if (
      withName &&
      acceptedName != null &&
      (options?.forceName || name.trim() === "")
    ) {
      setName(acceptedName);
    }
  };
  const handleNewEditorDone = () => {
    // An existing clause that wasn't edited keeps its clause, with a new name.
    const doneClause =
      committedRef.current ??
      // The widget's clause is the same MBQL clause, see useExpressionEditor.
      (initialClause as Lib.ExpressionClause | undefined);
    if (doneClause == null) {
      onClose?.();
      return;
    }
    if (withName && name.trim() === "") {
      return;
    }
    onChangeClause?.(name, doneClause);
    onClose?.();
  };

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

  // The editor of the notebook (AI and code, the docs panel), also in the
  // popovers of the chart screen. The docs panel shows in the page's right
  // sidebar, as in the notebook.
  if (USE_NEW_EDITOR) {
    return (
      <Box className={S.widget} data-ignore-editor-clicks="true">
        {header}
        <InlineExpressionEditorF
          query={query}
          stageIndex={stageIndex}
          expressionIndex={expressionIndex}
          expressionMode={expressionMode}
          availableColumns={availableColumns}
          availableMetrics={availableMetrics}
          reportTimezone={reportTimezone}
          readOnly={readOnly}
          clause={initialClause}
          name={initialName}
          hasDefaultName={!initialName}
          initialExpressionClause={initialExpressionClause}
          onCommit={handleNewEditorCommit}
          onDone={handleNewEditorDone}
          onDiscard={() => onClose?.()}
        />
        {withName && (
          <Box className={S.name}>
            <NameInput
              value={name}
              onChange={setName}
              onSubmit={handleNewEditorDone}
              expressionMode={expressionMode}
              readOnly={readOnly}
            />
          </Box>
        )}
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
