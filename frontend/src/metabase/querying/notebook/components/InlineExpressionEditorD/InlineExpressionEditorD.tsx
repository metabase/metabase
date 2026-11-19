import { EditorView } from "@codemirror/view";
import cx from "classnames";
import { type KeyboardEvent, useCallback, useRef, useState } from "react";
import { t } from "ttag";

import {
  EXPRESSION_HIDE_AI_SETTING,
  usePrototypeSetting,
} from "metabase/prototype";
import {
  type ExpressionError,
  isEnterForTheEditor,
} from "metabase/querying/expressions";
import { useSetting } from "metabase/settings";
import { Tooltip, UnstyledButton } from "metabase/ui";
import * as Lib from "metabase-lib";

import { EditorD } from "../../../components/expressions/EditorD";
import type {
  EditorChangeMeta,
  FormatNow,
  GenerateNow,
  ValidateNow,
} from "../../../components/expressions/EditorD/EditorD";
import { Layout } from "../../../components/expressions/Layout";
import type { InlineExpressionEditorProps } from "../InlineExpressionEditor";
import { ExpressionPreview } from "../InlineExpressionEditor/ExpressionPreview";

import { AiPrompt } from "./AiPrompt";
import S from "./InlineExpressionEditorD.module.css";
import FunctionIcon from "./function.svg?component";

type PreviewRun = {
  source: string;
  clause: Lib.ExpressionClause;
  name?: string;
};

/** True when the instance has a working AI provider, and the prototype doesn't hide the AI. */
function useIsAiAvailable() {
  const isConfigured = Boolean(useSetting("llm-metabot-configured?"));
  const [isHidden] = usePrototypeSetting(EXPRESSION_HIDE_AI_SETTING);
  return isConfigured && !isHidden;
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

/** True when the key is in the code, not in the prompt or another field. */
function isInCode(target: EventTarget) {
  return target instanceof HTMLElement && target.matches(".cm-content");
}

/**
 * True when Enter in the code may save: not when it picks a suggestion or
 * moves to the next placeholder of a function or template.
 */
function isOnPlainCode(target: EventTarget) {
  if (!isInCode(target) || !(target instanceof HTMLElement)) {
    return false;
  }
  const view = EditorView.findFromDOM(target);
  return view != null && !view.composing && !isEnterForTheEditor(view.state);
}

function getBreakoutKey(
  query: Lib.Query,
  stageIndex: number,
  expressionMode: Lib.ExpressionMode,
) {
  if (expressionMode !== "aggregation") {
    return "";
  }
  return Lib.breakouts(query, stageIndex)
    .map((breakout) => Lib.displayInfo(query, stageIndex, breakout).displayName)
    .join("\n");
}

/**
 * Version D: the AI prompt and the code, one above the other. "=" or the f
 * button opens the code below the prompt, with the docs; the prompt stays,
 * and asks the AI to change the code.
 */
export function InlineExpressionEditorD({
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

  // A new clause starts with the prompt only, an existing one or a draft
  // with text also shows its code.
  const [isCodeShown, setIsCodeShown] = useState(
    () =>
      !canUseAi ||
      clause != null ||
      initialExpressionClause != null ||
      (initialSource ?? "").trim() !== "",
  );
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiError, setAiError] = useState<string>();

  const [error, setError] = useState<ExpressionError | null>(null);
  // The text in the editor. The editor reports the opened expression when it
  // validates it.
  const [editedSource, setEditedSource] = useState<string>();
  // The expression in the preview. The preview runs only on request, so it
  // can be outdated.
  const [previewRun, setPreviewRun] = useState<PreviewRun>();
  const [previewRefreshKey, setPreviewRefreshKey] = useState(0);
  // The groups of an aggregation also change its result, so a preview of
  // other groups is outdated.
  const breakoutKey = getBreakoutKey(query, stageIndex, expressionMode);
  const breakoutKeyRef = useRef(breakoutKey);
  breakoutKeyRef.current = breakoutKey;
  const [previewBreakoutKey, setPreviewBreakoutKey] = useState(breakoutKey);

  const showPreview = useCallback((run: PreviewRun) => {
    setPreviewRun(run);
    setPreviewBreakoutKey(breakoutKeyRef.current);
    setPreviewRefreshKey((key) => key + 1);
  }, []);
  // Errors show only after the user asks for a check: Enter or Done. The
  // next edit hides them.
  const [isErrorShown, setIsErrorShown] = useState(false);
  const validateRef = useRef<ValidateNow | null>(null);
  const formatRef = useRef<FormatNow | null>(null);
  const generateRef = useRef<GenerateNow | null>(null);
  const cancelGenerateRef = useRef<(() => void) | null>(null);
  const focusCodeRef = useRef<(() => void) | null>(null);
  const docsRef = useRef<((isOpen: boolean) => void) | null>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);

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
    const run = checkNow();
    if (run != null) {
      showPreview(run);
    }
  };

  const isPreviewOutdated =
    previewRun != null &&
    ((editedSource !== undefined && editedSource !== previewRun.source) ||
      breakoutKey !== previewBreakoutKey);

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

  // Opens the code below the prompt, with the cursor in it. The user's own
  // switch to the code also opens the docs.
  const showCode = ({ withDocs }: { withDocs: boolean }) => {
    setIsCodeShown(true);
    setAiError(undefined);
    if (withDocs) {
      docsRef.current?.(true);
    }
    // The code shows on the next render.
    requestAnimationFrame(() => focusCodeRef.current?.());
  };

  // Hides the code, which stays saved and is still the code that the prompt
  // changes, and goes back to the prompt.
  const hideCode = () => {
    setIsCodeShown(false);
    docsRef.current?.(false);
    promptRef.current?.focus();
  };

  const toggleCode = () =>
    isCodeShown ? hideCode() : showCode({ withDocs: true });

  const sendPrompt = async () => {
    const request = prompt.trim();
    if (request === "" || isGenerating || generateRef.current == null) {
      return;
    }
    setAiError(undefined);
    setIsGenerating(true);
    const result = await generateRef.current({
      prompt: request,
      context: isEmpty ? "" : (editedSource ?? ""),
    });
    setIsGenerating(false);
    if (result.status === "error") {
      setAiError(result.message);
    } else if (result.status === "done") {
      // The answer shows in the code below; the prompt keeps the focus for
      // the next change.
      setPrompt("");
      setIsCodeShown(true);
      promptRef.current?.focus();
    }
  };

  // Stops the request; the prompt stays to edit and send again.
  const cancelPrompt = () => {
    cancelGenerateRef.current?.();
    setIsGenerating(false);
  };

  // Enter in the code saves and keeps the editor open (see saveAndShow), and
  // Shift+Enter starts a new line. Escape closes the editor, once it doesn't
  // close the suggestions or leave the placeholders (the code does that
  // first). The capture phase comes before the keymap of the code editor.
  const handleKeyDownCapture = (event: KeyboardEvent) => {
    if (event.key === "Escape" && isInCode(event.target)) {
      event.preventDefault();
      onDiscard();
      return;
    }
    if (event.key !== "Enter") {
      return;
    }
    // Enter also confirms the characters of an input method (Japanese,
    // Chinese, Korean…) while they're composed.
    const isComposing = event.nativeEvent.isComposing;
    if (
      event.shiftKey ||
      event.altKey ||
      isComposing ||
      readOnly ||
      !isOnPlainCode(event.target)
    ) {
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
  // shows its errors, with the code shown.
  const handleDone = () => {
    if (isEmpty) {
      onDiscard();
      return;
    }
    if (checkNow() != null) {
      onDone();
    } else if (!isCodeShown) {
      showCode({ withDocs: false });
    }
  };

  // Enter saves, and keeps the editor open to show what was saved: the text
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

  return (
    <Layout
      inline
      mt="sm"
      className={S.panel}
      data-testid="expression-editor"
      data-ignore-editor-clicks="true"
      onKeyDownCapture={handleKeyDownCapture}
    >
      <EditorD
        id="expression-content"
        isCodeShown={isCodeShown}
        prompt={
          <AiPrompt
            ref={promptRef}
            prompt={prompt}
            isGenerating={isGenerating}
            autoFocus={!isCodeShown}
            error={aiError}
            onPromptChange={(prompt) => {
              setPrompt(prompt);
              setAiError(undefined);
            }}
            onSubmit={sendPrompt}
            onEnterCode={() => showCode({ withDocs: true })}
            onClose={onDiscard}
          />
        }
        onExitCode={canUseAi ? hideCode : undefined}
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
        docsRef={docsRef}
        readOnly={readOnly}
        toolbarEnd={
          readOnly ? undefined : (
            <div className={S.toolbar}>
              {canUseAi && !isGenerating && (
                <Tooltip
                  label={isCodeShown ? t`Hide the code` : t`Show the code`}
                >
                  <UnstyledButton
                    className={cx(S.modeToggle, {
                      [S.isPressed]: isCodeShown,
                    })}
                    aria-label={t`Code`}
                    aria-pressed={isCodeShown}
                    onClick={toggleCode}
                  >
                    <FunctionIcon aria-hidden />
                  </UnstyledButton>
                </Tooltip>
              )}
              {isGenerating ? (
                <UnstyledButton
                  className={S.textButton}
                  onClick={cancelPrompt}
                >{t`Cancel`}</UnstyledButton>
              ) : (
                <UnstyledButton
                  className={S.textButton}
                  onClick={handleDone}
                >{t`Done`}</UnstyledButton>
              )}
            </div>
          )
        }
        name={name}
        hasDefaultName={hasDefaultName}
        onAcceptName={handleAcceptName}
        breakouts={breakouts}
        onAcceptBreakouts={onAcceptBreakouts}
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
          runLabel={t`Update preview (Enter)`}
          onRun={runPreview}
        />
      )}
    </Layout>
  );
}
