import { type KeyboardEvent, useCallback, useRef, useState } from "react";
import { t } from "ttag";

import type { ExpressionError } from "metabase/querying/expressions";
import { Button, Flex, Icon, Tooltip } from "metabase/ui";
import { isMac } from "metabase/utils/browser";
import type * as Lib from "metabase-lib";

import { Editor } from "../../../components/expressions/Editor";
import type { EditorChangeMeta } from "../../../components/expressions/Editor/Editor";
import { Layout, LayoutFooter } from "../../../components/expressions/Layout";
import { ShortcutsMenu } from "../../../components/expressions/ShortcutsMenu";

import { ExpressionPreview } from "./ExpressionPreview";
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
  /** Absent while the pill is a draft */
  name?: string;
  /** True when a commit with a name can rename the column without asking. */
  hasDefaultName: boolean;

  /** `forceName` renames the column even when the user named it. */
  onCommit: (
    clause: Lib.ExpressionClause,
    name?: string,
    options?: { forceName?: boolean },
  ) => void;
  initialSource?: string;
  onSourceChange?: (source: string, isValid: boolean) => void;

  onDone: () => void;
  onDiscard: () => void;
};

type PreviewRun = {
  source: string;
  clause: Lib.ExpressionClause;
  /** The name of a proposed change, when it has one. */
  name?: string;
};

const PREVIEW_SHORTCUT = isMac() ? "⌘ Enter" : "Ctrl Enter";

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
  name,
  hasDefaultName,
  onCommit,
  initialSource,
  onSourceChange,
  onDone,
  onDiscard,
}: InlineExpressionEditorProps) {
  const [error, setError] = useState<ExpressionError | null>(null);
  // The text in the editor, and the last valid expression. The editor
  // reports the opened expression when it validates it.
  const [editedSource, setEditedSource] = useState<string>();
  const [lastValid, setLastValid] = useState<PreviewRun>();
  // The expression in the preview. The preview runs only on request, so it
  // can be outdated.
  const [previewRun, setPreviewRun] = useState<PreviewRun>();
  const [previewRefreshKey, setPreviewRefreshKey] = useState(0);

  // A change proposed as a diff. The preview runs it, so that the user can
  // check the result before accepting it.
  const [proposal, setProposal] = useState<PreviewRun | null>(null);

  const showPreview = useCallback((run: PreviewRun) => {
    setPreviewRun(run);
    setPreviewRefreshKey((key) => key + 1);
  }, []);
  const runPreview = () => {
    const run = proposal ?? lastValid;
    if (run != null) {
      showPreview(run);
    }
  };
  const shownSource = proposal?.source ?? editedSource;
  const isPreviewOutdated =
    previewRun != null &&
    shownSource !== undefined &&
    shownSource !== previewRun.source;

  // A new proposal runs in the preview at once. An accepted one stays in the
  // preview; a rejected one makes the preview outdated.
  const hasProposalRef = useRef(false);
  const handleProposalChange = useCallback(
    (
      next: {
        source: string;
        clause: Lib.ExpressionClause | null;
        name?: string;
      } | null,
    ) => {
      const isNew = next != null && !hasProposalRef.current;
      hasProposalRef.current = next != null;
      const run =
        next?.clause != null ? { ...next, clause: next.clause } : null;
      setProposal(run);
      if (isNew && run != null) {
        showPreview(run);
      } else if (run != null) {
        // A new name for the proposal in the preview shows at once.
        setPreviewRun((previewRun) =>
          previewRun?.source === run.source && previewRun.name !== run.name
            ? { ...previewRun, name: run.name }
            : previewRun,
        );
      }
    },
    [showPreview],
  );

  const handleEdit = useCallback(
    (source: string, clause: Lib.ExpressionClause | null) => {
      setEditedSource(source);
      if (clause != null) {
        setLastValid({ source, clause });
      }
    },
    [],
  );

  // Cmd/Ctrl+Enter opens the preview, or runs it again. The capture phase
  // comes before the keymap of the code editor.
  const handleKeyDownCapture = (event: KeyboardEvent) => {
    if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    runPreview();
  };
  const [hasExpression, setHasExpression] = useState(clause != null);

  // Used to remount the editor, which re-formats from `editorClause`.
  const [revertCount, setRevertCount] = useState(0);

  // A combine or extract result, shown before the query prop catches up.
  const [shortcutClause, setShortcutClause] = useState<Lib.ExpressionClause>();
  const editorClause = shortcutClause ?? clause;

  // The name of an accepted AI suggestion, which the next valid edit commits.
  const acceptedNameRef = useRef<string | undefined>(undefined);
  const handleAcceptName = useCallback((name: string) => {
    acceptedNameRef.current = name;
  }, []);

  const handleChange = useCallback(
    (
      clause: Lib.ExpressionClause | null,
      error: ExpressionError | null,
      { hasSourceChanged, source }: EditorChangeMeta,
    ) => {
      const isValid = !error && clause != null;
      if (isValid) {
        setLastValid({ source, clause });
      }
      setError(error);
      setHasExpression(clause != null);
      onSourceChange?.(source, isValid);

      if (isValid && hasSourceChanged) {
        const acceptedName = acceptedNameRef.current;
        acceptedNameRef.current = undefined;
        onCommit(clause, acceptedName, { forceName: acceptedName != null });
      }
    },
    [onCommit, onSourceChange],
  );

  const handleRevert = useCallback(() => {
    setShortcutClause(undefined);
    setError(null);
    setHasExpression(true);
    onSourceChange?.("", true);
    setRevertCount((count) => count + 1);
  }, [onSourceChange]);

  const applyShortcut = useCallback(
    (clause: Lib.ExpressionClause, name: string) => {
      onCommit(clause, name);
      setShortcutClause(clause);
      setError(null);
      setHasExpression(true);
      onSourceChange?.("", true);
      setRevertCount((count) => count + 1);
    },
    [onCommit, onSourceChange],
  );

  const isValid = error == null && hasExpression;
  const isSaved = clause != null;

  return (
    <Layout
      inline
      mt="sm"
      className={S.panel}
      data-testid="expression-editor"
      data-ignore-editor-clicks="true"
      onKeyDownCapture={handleKeyDownCapture}
    >
      <Editor
        key={revertCount}
        id="expression-content"
        expressionMode={expressionMode}
        clause={editorClause}
        initialClause={editorClause}
        initialSource={revertCount === 0 ? initialSource : undefined}
        onChange={handleChange}
        onEdit={handleEdit}
        onProposalChange={handleProposalChange}
        query={query}
        stageIndex={stageIndex}
        expressionIndex={expressionIndex}
        availableColumns={availableColumns}
        availableMetrics={availableMetrics}
        reportTimezone={reportTimezone}
        error={error}
        readOnly={readOnly}
        renderShortcutsMenu={
          readOnly
            ? undefined
            : ({ getSource, validate, proposeSource }) => (
                <ShortcutsMenu
                  query={query}
                  stageIndex={stageIndex}
                  expressionMode={expressionMode}
                  availableColumns={availableColumns}
                  name={name}
                  hasDefaultName={hasDefaultName}
                  getSource={getSource}
                  validate={validate}
                  onSubmit={applyShortcut}
                  onGenerate={proposeSource}
                />
              )
        }
        name={name}
        hasDefaultName={hasDefaultName}
        onAcceptName={handleAcceptName}
        inline
      />

      {previewRun != null && (
        <ExpressionPreview
          query={query}
          stageIndex={stageIndex}
          expressionIndex={expressionIndex}
          clause={previewRun.clause}
          name={previewRun.name ?? name ?? t`New column`}
          refreshKey={previewRefreshKey}
          isOutdated={isPreviewOutdated}
          runShortcut={PREVIEW_SHORTCUT}
          onRun={runPreview}
          onClose={() => setPreviewRun(undefined)}
        />
      )}

      {!readOnly && (
        <LayoutFooter className={S.footer}>
          <Flex p="sm" gap="sm" justify="end" align="center">
            {previewRun == null && (
              <Tooltip label={t`Preview (${PREVIEW_SHORTCUT})`}>
                <Button
                  variant="subtle"
                  mr="auto"
                  leftSection={<Icon name="play" />}
                  disabled={lastValid == null}
                  onClick={runPreview}
                >{t`Preview`}</Button>
              </Tooltip>
            )}
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
