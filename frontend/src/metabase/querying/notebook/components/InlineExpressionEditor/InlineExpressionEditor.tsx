import { useCallback, useState } from "react";
import { t } from "ttag";

import type { ExpressionError } from "metabase/querying/expressions";
import { Button, Flex } from "metabase/ui";
import type * as Lib from "metabase-lib";

import { Editor } from "../../../components/expressions/Editor";
import type { EditorChangeMeta } from "../../../components/expressions/Editor/Editor";
import { Layout, LayoutFooter } from "../../../components/expressions/Layout";

import S from "./InlineExpressionEditor.module.css";

export type InlineExpressionEditorProps = {
  query: Lib.Query;
  stageIndex: number;
  expressionIndex?: number;
  expressionMode: Lib.ExpressionMode;
  availableColumns: Lib.ColumnMetadata[];
  availableMetrics?: Lib.MetricMetadata[];
  reportTimezone?: string;
  readOnly?: boolean;

  /** Absent while the pill is a draft */
  clause?: Lib.Expressionable;

  onCommit: (clause: Lib.ExpressionClause) => void;
  initialSource?: string;
  onSourceChange?: (source: string, isValid: boolean) => void;

  onDone: () => void;
  onDiscard: () => void;
};

export function InlineExpressionEditor({
  query,
  stageIndex,
  expressionIndex,
  expressionMode,
  availableColumns,
  availableMetrics,
  reportTimezone,
  readOnly,
  clause,
  onCommit,
  initialSource,
  onSourceChange,
  onDone,
  onDiscard,
}: InlineExpressionEditorProps) {
  const [error, setError] = useState<ExpressionError | null>(null);
  const [hasExpression, setHasExpression] = useState(clause != null);

  // Used to remount the editor, which re-formats from the clause in the query.
  const [revertCount, setRevertCount] = useState(0);

  const handleChange = useCallback(
    (
      clause: Lib.ExpressionClause | null,
      error: ExpressionError | null,
      { hasSourceChanged, source }: EditorChangeMeta,
    ) => {
      const isValid = !error && clause != null;
      setError(error);
      setHasExpression(clause != null);
      onSourceChange?.(source, isValid);

      if (isValid && hasSourceChanged) {
        onCommit(clause);
      }
    },
    [onCommit, onSourceChange],
  );

  const handleRevert = useCallback(() => {
    setError(null);
    setHasExpression(true);
    onSourceChange?.("", true);
    setRevertCount((count) => count + 1);
  }, [onSourceChange]);

  const isValid = error == null && hasExpression;
  const isSaved = clause != null;

  return (
    <Layout
      inline
      mt="sm"
      className={S.panel}
      data-testid="expression-editor"
      data-ignore-editor-clicks="true"
    >
      <Editor
        key={revertCount}
        id="expression-content"
        expressionMode={expressionMode}
        clause={clause}
        initialClause={clause}
        initialSource={revertCount === 0 ? initialSource : undefined}
        onChange={handleChange}
        query={query}
        stageIndex={stageIndex}
        expressionIndex={expressionIndex}
        availableColumns={availableColumns}
        availableMetrics={availableMetrics}
        reportTimezone={reportTimezone}
        error={error}
        readOnly={readOnly}
        withPopoverExitGuard={false}
        withHostedSidebar
      />

      {!readOnly && (
        <LayoutFooter>
          <Flex p="sm" gap="sm" justify="end" align="center">
            {!isValid &&
              (isSaved ? (
                <Button
                  variant="subtle"
                  color="neutral"
                  onClick={handleRevert}
                >{t`Revert to saved`}</Button>
              ) : (
                <Button
                  variant="subtle"
                  color="neutral"
                  onClick={onDiscard}
                >{t`Discard`}</Button>
              ))}
            <Button variant="filled" disabled={!isValid} onClick={onDone}>
              {t`Done`}
            </Button>
          </Flex>
        </LayoutFooter>
      )}
    </Layout>
  );
}
