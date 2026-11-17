import { EditorView } from "@codemirror/view";
import { type KeyboardEvent, useCallback, useRef, useState } from "react";
import { t } from "ttag";

import {
  EXPRESSION_HIDE_AI_SETTING,
  usePrototypeSetting,
} from "metabase/prototype";
import {
  type ExpressionError,
  isEnterForTheEditor,
  isRequestText,
} from "metabase/querying/expressions";
import { useSetting } from "metabase/settings";
import { ActionIcon, Button, Tooltip } from "metabase/ui";
import { isMac } from "metabase/utils/browser";
import type * as Lib from "metabase-lib";

import { Editor } from "../../../components/expressions/Editor";
import type {
  EditorChangeMeta,
  FormatNow,
  GenerateNow,
  ValidateNow,
} from "../../../components/expressions/Editor/Editor";
import { ToolbarSegment } from "../../../components/expressions/Editor/InlineToolbar";
import AiIcon from "../../../components/expressions/Editor/ai.svg?component";
import CloseIcon from "../../../components/expressions/Editor/close.svg?component";
import PlayIcon from "../../../components/expressions/Editor/play.svg?component";
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
  /** A function to start with, from the list of the picker. */
  initialExpressionClause?: Lib.DefinedClauseName | null;
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

/** True when the instance has a working AI provider, and the prototype doesn't hide the AI. */
function useIsAiAvailable() {
  const isConfigured = Boolean(useSetting("llm-metabot-configured?"));
  const [isHidden] = usePrototypeSetting(EXPRESSION_HIDE_AI_SETTING);
  return isConfigured && !isHidden;
}

function getPreviewLabel(expressionMode: Lib.ExpressionMode) {
  switch (expressionMode) {
    case "filter":
      return t`Preview filter`;
    case "aggregation":
      return t`Preview summary`;
    default:
      return t`Preview column`;
  }
}

function getResultName(
  expressionMode: Lib.ExpressionMode,
  name: string | undefined,
) {
  switch (expressionMode) {
    case "filter":
      return t`Matches`;
    case "aggregation":
      return name;
    default:
      return name ?? t`New column`;
  }
}

const PREVIEW_SHORTCUT = isMac() ? "⌘ Enter" : "Ctrl Enter";

/**
 * True when Enter in the code may save: not when it picks a suggestion or
 * moves to the next placeholder of a function or template. The AI prompt and
 * other fields use Enter for themselves.
 */
function isOnPlainCode(target: EventTarget) {
  if (!(target instanceof HTMLElement) || !target.matches(".cm-content")) {
    return false;
  }
  const view = EditorView.findFromDOM(target);
  return view != null && !view.composing && !isEnterForTheEditor(view.state);
}

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
  initialExpressionClause,
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
  const formatRef = useRef<FormatNow | null>(null);
  const generateRef = useRef<GenerateNow | null>(null);
  const askAiRef = useRef<(() => void) | null>(null);
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
  // The Preview button and Cmd/Ctrl+Enter show the preview, or hide it when
  // it shows.
  const isPreviewShown = previewRun != null;
  const togglePreview = () => {
    if (isPreviewShown) {
      setPreviewRun(undefined);
    } else {
      runPreview();
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
  const isAiAvailable = useIsAiAvailable();
  const canGenerate =
    isAiAvailable &&
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

  // Cmd/Ctrl+Enter shows or hides the preview, or sends a request to the AI.
  // Enter in the code saves and keeps the editor open (see saveAndShow), or
  // sends the request, and Shift+Enter starts a new line. The capture phase
  // comes before the keymap of the code editor.
  const handleKeyDownCapture = (event: KeyboardEvent) => {
    if (event.key !== "Enter") {
      return;
    }
    if (event.metaKey || event.ctrlKey) {
      event.preventDefault();
      event.stopPropagation();
      if (canGenerate) {
        runGenerate();
      } else {
        togglePreview();
      }
      return;
    }
    // Enter also confirms the characters of an input method (Japanese,
    // Chinese, Korean…) while they're composed.
    const isComposing = event.nativeEvent.isComposing;
    if (
      event.shiftKey ||
      event.altKey ||
      isComposing ||
      !isOnPlainCode(event.target)
    ) {
      return;
    }
    if (readOnly || proposal != null) {
      return;
    }
    // Text fields in the editor, like the "@" prompt, handle Enter themselves.
    if (event.target instanceof HTMLInputElement) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (canGenerate) {
      runGenerate();
    } else {
      saveAndShow();
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

  // Enter saves, and keeps the editor open to show what was saved: the text
  // tidied, like `subtotal + total` to `[Subtotal] + [Total]`, and the
  // preview of the result. A text that isn't valid shows its errors.
  const saveAndShow = async () => {
    const run = proposal == null ? checkNow() : null;
    if (run == null) {
      return;
    }
    const formatted = await formatRef.current?.();
    showPreview(formatted ?? run);
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
        initialExpressionClause={initialExpressionClause}
        onChange={handleChange}
        onEdit={handleEdit}
        onProposalChange={handleProposalChange}
        onGenerated={showPreview}
        query={query}
        stageIndex={stageIndex}
        expressionIndex={expressionIndex}
        availableColumns={availableColumns}
        availableMetrics={availableMetrics}
        reportTimezone={reportTimezone}
        error={error}
        showErrors={isErrorShown}
        validateRef={validateRef}
        formatRef={formatRef}
        generateRef={generateRef}
        canGenerateFromText={isAiAvailable && isNewExpression && !readOnly}
        isAiAvailable={isAiAvailable}
        readOnly={readOnly}
        askAiRef={askAiRef}
        toolbarStart={
          readOnly ? undefined : (
            <>
              {canGenerate ? (
                <ToolbarSegment
                  icon={<AiIcon />}
                  label={t`Generate with AI (${PREVIEW_SHORTCUT})`}
                  disabled={isGenerating}
                  onClick={runGenerate}
                />
              ) : (
                isAiAvailable && (
                  <ToolbarSegment
                    icon={<AiIcon />}
                    label={t`Edit with AI`}
                    onClick={() => askAiRef.current?.()}
                  />
                )
              )}
              <ToolbarSegment
                icon={<PlayIcon />}
                label={
                  isPreviewShown
                    ? t`Hide preview (${PREVIEW_SHORTCUT})`
                    : `${getPreviewLabel(expressionMode)} (${PREVIEW_SHORTCUT})`
                }
                isPressed={isPreviewShown}
                disabled={isEmpty && !isPreviewShown}
                onClick={togglePreview}
              />
            </>
          )
        }
        toolbarEnd={
          readOnly ? undefined : (
            <>
              <Button
                size="sm"
                variant="default"
                miw={64}
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
                  <CloseIcon />
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
          expressionMode={expressionMode}
          expressionIndex={expressionIndex}
          clause={previewRun.clause}
          name={getResultName(expressionMode, previewRun.name ?? name)}
          refreshKey={previewRefreshKey}
          isOutdated={isPreviewOutdated}
        />
      )}
    </Layout>
  );
}
