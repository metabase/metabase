import { type KeyboardEvent, useCallback, useRef, useState } from "react";
import { t } from "ttag";

import type { ExpressionError } from "metabase/querying/expressions";
import { ActionIcon, Button, Icon, Tooltip } from "metabase/ui";
import { isMac } from "metabase/utils/browser";
import type * as Lib from "metabase-lib";

import { Editor } from "../../../components/expressions/Editor";
import type {
  EditorChangeMeta,
  GenerateNow,
  ValidateNow,
} from "../../../components/expressions/Editor/Editor";
import { isRequestText } from "../../../components/expressions/Editor/request-text";
import { Layout } from "../../../components/expressions/Layout";

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
  // The text in the editor. The editor reports the opened expression when it
  // validates it.
  const [editedSource, setEditedSource] = useState<string>();
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
  // Errors show only after the user asks for a check: preview, refresh or
  // save. The next edit hides them.
  const [isErrorShown, setIsErrorShown] = useState(false);
  const validateRef = useRef<ValidateNow | null>(null);
  const generateRef = useRef<GenerateNow | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  /** Checks the text now. Returns it when it is valid, or shows its errors. */
  const checkNow = (): PreviewRun | null => {
    const result = validateRef.current?.();
    if (result == null) {
      return null;
    }
    if (result.error != null || result.clause == null) {
      setIsErrorShown(true);
      return null;
    }
    return { source: result.source, clause: result.clause };
  };

  const runPreview = () => {
    const run = proposal ?? checkNow();
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

  // A check also reports the text, so only a new text hides the errors.
  const editedSourceRef = useRef<string | undefined>(undefined);
  // Whether the text compiles, without the delay of `onChange`.
  const [isEditedValid, setIsEditedValid] = useState(true);
  const handleEdit = useCallback(
    (source: string, clause: Lib.ExpressionClause | null) => {
      setIsEditedValid(source.trim() === "" || clause != null);
      if (source !== editedSourceRef.current) {
        editedSourceRef.current = source;
        setEditedSource(source);
        setIsErrorShown(false);
      }
    },
    [],
  );

  // In a new column, text that is not an expression but reads like a
  // request goes to the AI as it is.
  // The parent keeps the text of a draft in `initialSource`, so only the value
  // at the start tells that the column was empty.
  const [isNewExpression] = useState(
    () => clause == null && (initialSource ?? "").trim() === "",
  );
  const canGenerate =
    isNewExpression &&
    !readOnly &&
    proposal == null &&
    !isEditedValid &&
    isRequestText(editedSource ?? "");

  const runGenerate = async () => {
    if (isGenerating) {
      return;
    }
    setIsGenerating(true);
    await generateRef.current?.();
    setIsGenerating(false);
  };

  // Cmd/Ctrl+Enter opens the preview, runs it again, or sends a request to
  // the AI. The capture phase comes before the keymap of the code editor.
  const handleKeyDownCapture = (event: KeyboardEvent) => {
    if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (canGenerate) {
      runGenerate();
    } else {
      runPreview();
    }
  };

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
      setError(error);
      onSourceChange?.(source, isValid);

      if (isValid && hasSourceChanged) {
        const acceptedName = acceptedNameRef.current;
        acceptedNameRef.current = undefined;
        onCommit(clause, acceptedName, { forceName: acceptedName != null });
      }
    },
    [onCommit, onSourceChange],
  );

  const isEmpty = (editedSource ?? "").trim() === "";
  const handleSave = () => {
    if (proposal == null && checkNow() != null) {
      onDone();
    }
  };

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
        id="expression-content"
        expressionMode={expressionMode}
        clause={clause}
        initialClause={clause}
        initialSource={initialSource}
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
        showErrors={isErrorShown}
        validateRef={validateRef}
        generateRef={generateRef}
        readOnly={readOnly}
        toolbarStart={
          canGenerate ? (
            <Tooltip label={t`Generate with AI (${PREVIEW_SHORTCUT})`}>
              <Button
                size="sm"
                variant="subtle"
                className={S.toolbarButton}
                disabled={isGenerating}
                onClick={runGenerate}
              >{t`Generate with AI`}</Button>
            </Tooltip>
          ) : (
            !readOnly &&
            previewRun == null && (
              <Tooltip label={t`Preview (${PREVIEW_SHORTCUT})`}>
                <Button
                  size="sm"
                  variant="subtle"
                  color="neutral"
                  className={S.toolbarButton}
                  disabled={isEmpty}
                  onClick={runPreview}
                >{t`Preview`}</Button>
              </Tooltip>
            )
          )
        }
        toolbarEnd={
          readOnly ? undefined : (
            <>
              <Button
                size="sm"
                variant="subtle"
                className={S.toolbarButton}
                disabled={isEmpty}
                onClick={handleSave}
              >{t`Save`}</Button>
              <Tooltip label={t`Close`}>
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  color="neutral"
                  aria-label={t`Close`}
                  onClick={onDiscard}
                >
                  <Icon name="close" size={12} />
                </ActionIcon>
              </Tooltip>
            </>
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
    </Layout>
  );
}
