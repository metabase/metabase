import { EditorView } from "@codemirror/view";
import cx from "classnames";
import { type KeyboardEvent, useCallback, useRef, useState } from "react";
import { t } from "ttag";

import {
  EXPRESSION_HIDE_AI_SETTING,
  usePrototypeSetting,
} from "metabase/prototype";
import type { ExpressionError } from "metabase/querying/expressions";
import { useSetting } from "metabase/settings";
import { Button } from "metabase/ui";
import type * as Lib from "metabase-lib";

import { EditorF } from "../../../components/expressions/EditorF";
import type {
  EditorChangeMeta,
  FormatNow,
  GenerateNow,
  ValidateNow,
} from "../../../components/expressions/EditorF/EditorF";
import { Layout } from "../../../components/expressions/Layout";
import type { InlineExpressionEditorProps } from "../InlineExpressionEditor";
import {
  useLiveStepPreview,
  useStepPreview,
} from "../NotebookStep/StepPreviewContext";

import { AiPrompt } from "./AiPrompt";
import S from "./InlineExpressionEditorF.module.css";
import { ModeSwitch } from "./ModeSwitch";

/** A valid expression to run: the step's preview shows it. */
type PreviewRun = {
  source: string;
  clause: Lib.ExpressionClause;
  name?: string;
};

type Mode = "ai" | "code";

/** True when the instance has a working AI provider, and the prototype doesn't hide the AI. */
function useIsAiAvailable() {
  const isConfigured = Boolean(useSetting("llm-metabot-configured?"));
  const [isHidden] = usePrototypeSetting(EXPRESSION_HIDE_AI_SETTING);
  return isConfigured && !isHidden;
}

/** True when the key is in the code, not in the prompt or another field. */
function isInCode(target: EventTarget) {
  return target instanceof HTMLElement && target.matches(".cm-content");
}

/** True while an input method composes characters in the code. */
function isComposingInCode(target: EventTarget) {
  return (
    target instanceof HTMLElement &&
    EditorView.findFromDOM(target)?.composing === true
  );
}

/**
 * The button at the end of the editor: Cancel while there is nothing to run,
 * Run for a prompt or code that hasn't run, Stop while the AI works, and
 * Done once the code has run.
 */
type ActionButton = "cancel" | "run" | "stop" | "done";

function getActionButton({
  mode,
  prompt,
  lastRunPrompt,
  isGenerating,
  hasCode,
  hasCodeToRun,
}: {
  mode: Mode;
  prompt: string;
  /** The prompt of the AI's last answer, which stays in the input. */
  lastRunPrompt: string | undefined;
  isGenerating: boolean;
  hasCode: boolean;
  hasCodeToRun: boolean;
}): ActionButton {
  if (isGenerating) {
    return "stop";
  }
  const hasPromptToRun =
    mode === "ai" && prompt.trim() !== "" && prompt !== lastRunPrompt;
  if (hasPromptToRun || (mode === "code" && hasCodeToRun)) {
    return "run";
  }
  return hasCode ? "done" : "cancel";
}

/**
 * Version F: version B with a switch at the start of the input instead of
 * the f button. The AI mode and the code mode are separate. A new clause
 * starts with a prompt to the AI; "=" or the switch goes to the code, and the
 * switch goes back, with the code as context for the AI.
 */
export function InlineExpressionEditorF({
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
  breakouts,
  onAcceptBreakouts,
  onSourceChange,
  onDone,
  onDiscard,
}: InlineExpressionEditorProps) {
  const isAiAvailable = useIsAiAvailable();
  const canUseAi = isAiAvailable && !readOnly;

  // A new clause starts in AI mode, an existing one or a draft with text in
  // code mode.
  const [mode, setMode] = useState<Mode>(() =>
    canUseAi &&
    clause == null &&
    initialExpressionClause == null &&
    (initialSource ?? "").trim() === ""
      ? "ai"
      : "code",
  );
  // The prompt stays after the AI answers, to edit and send again.
  const [prompt, setPrompt] = useState("");
  const [lastRunPrompt, setLastRunPrompt] = useState<string>();
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiError, setAiError] = useState<string>();

  const [error, setError] = useState<ExpressionError | null>(null);
  // The text in the editor. The editor reports the opened expression when it
  // validates it.
  const [editedSource, setEditedSource] = useState<string>();
  // The text of the last run (Cmd+Enter, Run, or the AI's answer). Run shows
  // until the code changes from it.
  const [lastRunSource, setLastRunSource] = useState<string>();

  // A run opens the step's preview, the same as the step's ▶: the whole
  // table with the expression. It follows the step's query until the code
  // changes, so it shows the expression once it's saved to the step.
  const stepPreview = useStepPreview();
  const showPreview = useCallback(
    (run: PreviewRun) => {
      setLastRunSource(run.source);
      stepPreview?.run();
    },
    [stepPreview],
  );
  // Errors show only after the user asks for a check: Enter or Done. The
  // next edit hides them.
  const [isErrorShown, setIsErrorShown] = useState(false);
  const validateRef = useRef<ValidateNow | null>(null);
  const formatRef = useRef<FormatNow | null>(null);
  const generateRef = useRef<GenerateNow | null>(null);
  const cancelGenerateRef = useRef<(() => void) | null>(null);
  const focusCodeRef = useRef<(() => void) | null>(null);
  const clearCodeRef = useRef<(() => void) | null>(null);

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

  // A check also reports the text, so only a new text hides the errors.
  const editedSourceRef = useRef<string | undefined>(undefined);
  const handleEdit = useCallback((source: string) => {
    if (source !== editedSourceRef.current) {
      editedSourceRef.current = source;
      setEditedSource(source);
      setIsErrorShown(false);
    }
  }, []);

  const isEmpty = (editedSource ?? "").trim() === "";
  // In AI mode, the code that the prompt changes.
  const context = isEmpty ? null : (editedSource ?? null);

  // Removing the code from the prompt starts over: no code. The prompt stays,
  // to run again without the code.
  const clearContext = () => {
    clearCodeRef.current?.();
    setLastRunSource(undefined);
    setLastRunPrompt(undefined);
  };

  const enterCode = () => {
    setMode("code");
    setAiError(undefined);
    // The code shows on the next render.
    requestAnimationFrame(() => focusCodeRef.current?.());
  };

  // The prompt of the last answer is still there, with the code as context.
  const enterAi = () => {
    setMode("ai");
    setAiError(undefined);
  };

  const sendPrompt = async () => {
    const sentPrompt = prompt;
    const request = sentPrompt.trim();
    if (request === "" || isGenerating || generateRef.current == null) {
      return;
    }
    setAiError(undefined);
    setIsGenerating(true);
    const result = await generateRef.current({
      prompt: request,
      context: context ?? "",
    });
    setIsGenerating(false);
    if (result.status === "error") {
      setAiError(result.message);
    } else if (result.status === "done") {
      setLastRunPrompt(sentPrompt);
      enterCode();
    }
  };

  // Stops the request; the prompt stays to edit and send again.
  const cancelPrompt = () => {
    cancelGenerateRef.current?.();
    setIsGenerating(false);
  };

  // Cmd+Enter (Ctrl+Enter) in the code saves and keeps the editor open (see
  // saveAndShow). Enter is the code editor's: it picks a suggestion, moves to
  // the next placeholder, or starts a new line. Escape closes the editor,
  // once it doesn't close the suggestions or leave the placeholders (the code
  // does that first). The capture phase comes before the keymap of the code
  // editor.
  const handleKeyDownCapture = (event: KeyboardEvent) => {
    if (!isInCode(event.target)) {
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      onDiscard();
      return;
    }
    const isSaveKey =
      event.key === "Enter" &&
      (event.metaKey || event.ctrlKey) &&
      !event.shiftKey &&
      !event.altKey;
    // Enter also confirms the characters of an input method (Japanese,
    // Chinese, Korean…) while they're composed.
    const isComposing =
      event.nativeEvent.isComposing || isComposingInCode(event.target);
    if (!isSaveKey || isComposing || readOnly) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    saveAndShow();
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

  // Done closes the editor. An empty new clause is dropped. Invalid code
  // shows its errors, in code mode.
  const handleDone = () => {
    if (isEmpty) {
      onDiscard();
      return;
    }
    if (checkNow() != null) {
      onDone();
    } else if (mode === "ai") {
      enterCode();
    }
  };

  // Cmd+Enter saves, and keeps the editor open to show what was saved: the text
  // tidied, like `subtotal + total` to `[Subtotal] + [Total]`, and the
  // preview of the result. A text that isn't valid shows its errors.
  const saveAndShow = async () => {
    const run = checkNow();
    if (run == null) {
      return;
    }
    const formatted = await formatRef.current?.();
    showPreview(formatted ?? run);
  };

  // The editor reports the text of an opened clause or draft only once it's
  // edited or checked; until then, that text counts as code that has run.
  const hasCode =
    editedSource !== undefined
      ? !isEmpty
      : clause != null ||
        initialExpressionClause != null ||
        (initialSource ?? "").trim() !== "";
  // Run shows the step's preview. Without one, like in a popover of the chart
  // screen, there is nothing to run: Done saves.
  const hasCodeToRun =
    stepPreview != null &&
    editedSource !== undefined &&
    !isEmpty &&
    editedSource !== lastRunSource;
  useLiveStepPreview(
    lastRunSource !== undefined && editedSource === lastRunSource,
  );
  const actionButton = getActionButton({
    mode,
    prompt,
    lastRunPrompt,
    isGenerating,
    hasCode,
    hasCodeToRun,
  });
  const actionButtonProps = {
    cancel: { label: t`Cancel`, isPrimary: false, onClick: onDiscard },
    run: {
      label: t`Run`,
      isPrimary: true,
      onClick: mode === "ai" ? sendPrompt : saveAndShow,
    },
    stop: { label: t`Stop`, isPrimary: false, onClick: cancelPrompt },
    done: { label: t`Done`, isPrimary: true, onClick: handleDone },
  }[actionButton];

  return (
    <div className={S.root}>
      <div className={S.editorRow}>
        <Layout
          inline
          className={S.panel}
          data-testid="expression-editor"
          data-ignore-editor-clicks="true"
          onKeyDownCapture={handleKeyDownCapture}
        >
          <EditorF
            id="expression-content"
            mode={mode}
            aiInput={
              <AiPrompt
                prompt={prompt}
                context={context}
                isGenerating={isGenerating}
                onPromptChange={(prompt) => {
                  setPrompt(prompt);
                  setAiError(undefined);
                }}
                onSubmit={sendPrompt}
                onEnterCode={enterCode}
                onRemoveContext={clearContext}
                onClose={onDiscard}
              />
            }
            aiError={mode === "ai" && !isGenerating ? aiError : undefined}
            onExitCode={canUseAi ? enterAi : undefined}
            expressionMode={expressionMode}
            clause={clause}
            initialClause={clause}
            initialSource={initialSource}
            initialExpressionClause={initialExpressionClause}
            onChange={handleChange}
            onEdit={handleEdit}
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
            cancelGenerateRef={cancelGenerateRef}
            focusRef={focusCodeRef}
            clearRef={clearCodeRef}
            readOnly={readOnly}
            toolbarStart={
              canUseAi ? (
                <ModeSwitch
                  mode={mode}
                  disabled={isGenerating}
                  onChange={(next) =>
                    next === "code" ? enterCode() : enterAi()
                  }
                />
              ) : undefined
            }
            toolbarEnd={
              readOnly ? undefined : (
                <div className={S.toolbar}>
                  {actionButton === "stop" && (
                    <span
                      className={S.loader}
                      role="status"
                      aria-label={t`Loading`}
                    />
                  )}
                  <Button
                    className={cx(S.actionButton, {
                      [S.isPrimary]: actionButtonProps.isPrimary,
                    })}
                    size="sm"
                    variant={actionButtonProps.isPrimary ? "light" : "subtle"}
                    color={actionButtonProps.isPrimary ? "brand" : "neutral"}
                    onClick={() => actionButtonProps.onClick()}
                  >
                    {actionButtonProps.label}
                  </Button>
                </div>
              )
            }
            name={name}
            hasDefaultName={hasDefaultName}
            onAcceptName={handleAcceptName}
            breakouts={breakouts}
            onAcceptBreakouts={onAcceptBreakouts}
          />
        </Layout>
      </div>
    </div>
  );
}
