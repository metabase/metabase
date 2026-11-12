import { closeCompletion } from "@codemirror/autocomplete";
import { unifiedMergeView } from "@codemirror/merge";
import { EditorSelection, type EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import type { ViewUpdate } from "@uiw/react-codemirror";
import cx from "classnames";
import {
  type MutableRefObject,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useMount } from "react-use";
import { t } from "ttag";
import _ from "underscore";

import { skipToken, useGetDatabaseQuery } from "metabase/api";
import {
  CodeMirror,
  type CodeMirrorRef,
} from "metabase/common/components/CodeMirror";
import {
  type ExpressionError,
  diagnoseAndCompile,
  expressionClauseSnippet,
  format,
  formatIdentifier,
  getClauseDefinition,
  insertExpressionTemplate,
  insertWithPlaceholders,
  tokenAtPos,
} from "metabase/querying/expressions";
import { COMMA, GROUP } from "metabase/querying/expressions/pratt";
import { ActionIcon, Tooltip as ButtonTooltip, Flex, Icon } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { Database } from "metabase-types/api";

import { useDiffControls } from "../../CodeMirrorEditor/use-diff-controls";
import { AvailableColumnsBrowser } from "../AvailableColumnsBrowser";
import { ExpressionSidePanel } from "../ExpressionSidePanel";
import type { ExpressionSidebarName } from "../ExpressionSidebar";
import { ExpressionSidebarPanel } from "../ExpressionSidebar";
import { LayoutMain, LayoutSidebar } from "../Layout";

import { CloseModal, useCloseModal } from "./CloseModal";
import S from "./Editor.module.css";
import { Errors } from "./Errors";
import { ExpressionDiffControls } from "./ExpressionDiffControls";
import { InlinePrompt, InlinePromptStatus } from "./InlinePrompt";
import { InlineToolbar } from "./InlineToolbar";
import type { Shortcut } from "./Shortcuts";
import { Shortcuts } from "./Shortcuts";
import { useSqlHint } from "./SqlHint";
import { Tooltip } from "./Tooltip";
import { caseCounts, useCaseCounts } from "./case-counts";
import { DEBOUNCE_VALIDATION_MS } from "./constants";
import { useCustomTooltip } from "./custom-tooltip";
import { useExtensions } from "./extensions";
import { closeInlinePrompt, inlinePrompt } from "./inline-prompt";
import { showErrors as showErrorMarks } from "./language";
import { useParameterHints } from "./parameter-hints";
import { useEditorSidebar } from "./use-editor-sidebar";
import { useGenerateExpression } from "./use-generate-expression";
import { hasActiveSnippet, useInitialClause } from "./utils";

export type EditorProps = {
  id?: string;
  clause?: Lib.Expressionable | null;
  initialClause?: Lib.Expressionable | null;
  query: Lib.Query;
  stageIndex: number;
  expressionMode: Lib.ExpressionMode;
  expressionIndex?: number;
  availableColumns: Lib.ColumnMetadata[];
  availableMetrics?: Lib.MetricMetadata[];
  reportTimezone?: string;
  readOnly?: boolean;
  error?: ExpressionError | Error | null;
  hasHeader?: boolean;
  onCloseEditor?: () => void;
  initialExpressionClause?: Lib.DefinedClauseName | null;

  /**
   * Set when the editor is on the page, not in a popover. It drops the exit
   * guard, which swallows clicks page-wide, and puts the sidebar in the host's
   * slot when there is one.
   */
  inline?: boolean;

  /** Rendered in the inline toolbar, before and after the docs button. */
  toolbarStart?: ReactNode;
  toolbarEnd?: ReactNode;
  /** The column name, which the AI uses as a hint. */
  name?: string;
  /** True when the AI can suggest a new column name. */
  hasDefaultName?: boolean;
  /** Called with the column name of an accepted AI suggestion. */
  onAcceptName?: (name: string) => void;
  initialSource?: string;

  onChange: (
    clause: Lib.ExpressionClause | null,
    error: ExpressionError | null,
    meta: EditorChangeMeta,
  ) => void;
  /**
   * Called on each change of the text, without the delay of `onChange`, with
   * the clause when the text is valid.
   */
  onEdit?: (source: string, clause: Lib.ExpressionClause | null) => void;
  /**
   * Called when a proposed change shows as a diff, or changes, or goes, with
   * the clause when the proposed text is valid, and the proposed name.
   */
  /** Called when an AI text goes into the code without a diff to confirm. */
  onGenerated?: (run: {
    source: string;
    clause: Lib.ExpressionClause;
    name?: string;
  }) => void;
  onProposalChange?: (
    proposal: {
      source: string;
      clause: Lib.ExpressionClause | null;
      name?: string;
    } | null,
  ) => void;
  shortcuts?: Shortcut[];
  /**
   * False hides the errors, the SQL hint and the error marks in the code, so
   * that the user can type without distraction. True by default.
   */
  showErrors?: boolean;
  /** Set to a function that checks the current text at once, without the delay. */
  validateRef?: MutableRefObject<ValidateNow | null>;
  /** Set to a function that sends the whole text to the AI as a request. */
  generateRef?: MutableRefObject<GenerateNow | null>;
};

export type GenerateNow = () => Promise<void>;

export type ValidateNow = () => {
  source: string;
  clause: Lib.ExpressionClause | null;
  error: ExpressionError | null;
};

type Proposal = { source: string; name?: string };

export type EditorChangeMeta = {
  /** False for the initial format pass, so autosaving callers can skip it. */
  hasSourceChanged: boolean;
  /** The raw text, which a caller can stash to restore later. */
  source: string;
};

// The editor on the page has no line numbers or code folding.
const INLINE_BASIC_SETUP = {
  lineNumbers: false,
  foldGutter: false,
  highlightActiveLineGutter: false,
};

const EDITOR_WIDGET_HEIGHT = 220;
const FB_HEIGHT = EDITOR_WIDGET_HEIGHT + 46;
const FB_HEIGHT_WITH_HEADER = FB_HEIGHT + 48;

export function Editor(props: EditorProps) {
  const {
    id,
    expressionMode = "expression",
    expressionIndex,
    stageIndex,
    query,
    availableColumns,
    availableMetrics,
    readOnly,
    error,
    reportTimezone,
    shortcuts,
    hasHeader,
    onCloseEditor,
    initialExpressionClause,
    inline = false,
    toolbarStart,
    toolbarEnd,
    name,
    hasDefaultName = false,
    onAcceptName,
    onProposalChange,
    onGenerated,
    showErrors = true,
    validateRef,
    generateRef,
  } = props;

  const ref = useRef<CodeMirrorRef>(null);
  const getEditorView = useCallback(() => ref.current?.view, []);
  const databaseId = Lib.databaseID(query);
  const { data: database } = useGetDatabaseQuery(
    databaseId != null ? { id: databaseId } : skipToken,
  );
  const { host, openSidebar, setOpenSidebar } = useEditorSidebar({ inline });

  const toggleSidebar = useCallback(
    (name: ExpressionSidebarName) =>
      setOpenSidebar(openSidebar === name ? null : name),
    [openSidebar, setOpenSidebar],
  );

  const {
    source,
    hasSourceChanged,
    onSourceChange,
    onBlur,
    formatExpression,
    isFormatting,
    isValidated,
    acceptSource,
    validateNow,
  } = useExpression({
    ...props,
    database,
    error,
  });

  const { showModal, closeModal } = useCloseModal({
    allowPopoverExit: inline || source === "" || !hasSourceChanged,
  });

  const [customTooltip, portal] = useCustomTooltip({
    getPosition: getTooltipPosition,
    render: (props) => (
      <Tooltip
        query={query}
        stageIndex={stageIndex}
        database={database}
        reportTimezone={reportTimezone}
        {...props}
      />
    ),
  });

  const baseExtensions = useExtensions({
    expressionMode,
    query,
    stageIndex,
    availableColumns,
    availableMetrics,
    database,
    extensions: [customTooltip],
  });

  const sourceRef = useRef(source);
  sourceRef.current = source;

  // An AI suggestion, shown as a diff against `source` until accepted or rejected.
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const proposedSource = proposal?.source ?? null;
  const isProposing = proposal != null;

  if (validateRef) {
    validateRef.current = validateNow;
  }
  useEffect(() => {
    const view = ref.current?.view;
    if (view) {
      showErrorMarks(view, showErrors);
    }
  }, [showErrors]);

  const validate = useCallback(
    (source: string) =>
      diagnoseAndCompile({
        source,
        expressionMode,
        query,
        stageIndex,
        expressionIndex: expressionIndex,
        database,
        availableColumns,
        availableMetrics,
      }).error?.message ?? null,
    [
      expressionMode,
      query,
      stageIndex,
      expressionIndex,
      database,
      availableColumns,
      availableMetrics,
    ],
  );

  const compileSource = useCallback(
    (source: string) => {
      const { expressionClause, error } = diagnoseAndCompile({
        source,
        expressionMode,
        query,
        stageIndex,
        expressionIndex,
        database,
        availableColumns,
        availableMetrics,
      });
      return error == null ? (expressionClause ?? null) : null;
    },
    [
      expressionMode,
      query,
      stageIndex,
      expressionIndex,
      database,
      availableColumns,
      availableMetrics,
    ],
  );

  // Formats an AI suggestion like the format button does. A source that does
  // not compile stays as it is, so that the editor can show its error.
  const formatProposedSource = useCallback(
    async (source: string) => {
      const expressionClause = compileSource(source);
      if (expressionClause == null) {
        return source;
      }
      return format(expressionClause, {
        query,
        stageIndex,
        availableColumns,
        printWidth: 55, // the same as the format button
      }).catch(() => source);
    },
    [compileSource, query, stageIndex, availableColumns],
  );

  // Shows a diff to confirm only a large change to a long expression. Other
  // suggestions go into the code at once.
  // After an AI text goes into the code, the cursor goes to its end, and no
  // autocomplete opens for the text.
  // The editor gets the text a few frames later, so wait for it.
  const focusEnd = useCallback((text: string) => {
    let frames = 10;
    const run = () => {
      const view = ref.current?.view;
      if (view == null) {
        return;
      }
      if (view.state.doc.toString() !== text && frames-- > 0) {
        requestAnimationFrame(run);
        return;
      }
      view.focus();
      view.dispatch({
        selection: { anchor: view.state.doc.length },
        scrollIntoView: true,
      });
      closeCompletion(view);
    };
    requestAnimationFrame(run);
  }, []);

  // A valid AI text runs in the preview, like a diff does.
  const reportGenerated = useCallback(
    (source: string, name?: string) => {
      const clause = compileSource(source);
      if (clause != null) {
        onGenerated?.({ source, clause, name: name || undefined });
      }
    },
    [compileSource, onGenerated],
  );

  const proposeSource = useCallback(
    async (source: string, name?: string) => {
      const formatted = await formatProposedSource(source);
      if (isComplexEdit(sourceRef.current, formatted)) {
        setProposal({ source: formatted, name });
      } else {
        if (name?.trim()) {
          onAcceptName?.(name.trim());
        }
        acceptSource(formatted);
        reportGenerated(formatted, name?.trim());
      }
      focusEnd(formatted);
    },
    [
      formatProposedSource,
      acceptSource,
      onAcceptName,
      focusEnd,
      reportGenerated,
    ],
  );

  // Text from a fix that the user already chose: no diff to confirm it.
  const applySource = useCallback(
    async (source: string) => {
      const formatted = await formatProposedSource(source);
      const result = acceptSource(formatted);
      reportGenerated(formatted);
      focusEnd(formatted);
      return result;
    },
    [acceptSource, formatProposedSource, focusEnd, reportGenerated],
  );

  useReportProposal(proposal, compileSource, onProposalChange);

  const handleProposedNameChange = useCallback((name: string) => {
    setProposal((proposal) => proposal && { ...proposal, name });
  }, []);

  const handleAcceptProposed = useCallback(() => {
    if (proposal == null) {
      return;
    }
    setProposal(null);
    const name = proposal.name?.trim();
    if (name) {
      onAcceptName?.(name);
    }
    acceptSource(proposal.source);
    focusEnd(proposal.source);
  }, [proposal, acceptSource, onAcceptName, focusEnd]);

  const handleRejectProposed = useCallback(() => {
    setProposal(null);
  }, []);

  const {
    extensions: diffControlsExtensions,
    portalTarget,
    shortcuts: diffShortcuts,
  } = useDiffControls({
    isEnabled: isProposing,
    onAcceptProposed: handleAcceptProposed,
    onRejectProposed: handleRejectProposed,
  });

  // "@" in the code opens a prompt to the AI at the cursor.
  const promptContainer = useMemo(() => document.createElement("span"), []);
  const [promptPos, setPromptPos] = useState<number | null>(null);
  const [promptError, setPromptError] = useState<string>();
  const {
    generate,
    cancel: cancelGenerate,
    isLoading: isGenerating,
  } = useGenerateExpression({
    query,
    stageIndex,
    expressionMode,
    availableColumns,
    name,
    hasDefaultName,
    validate,
  });

  const handlePromptChange = useCallback(
    (pos: number | null) => {
      setPromptPos(pos);
      setPromptError(undefined);
      if (pos == null) {
        cancelGenerate();
      }
    },
    [cancelGenerate],
  );

  const inlinePromptExtensions = useMemo(
    () =>
      inline && !readOnly && !isProposing
        ? inlinePrompt({
            container: promptContainer,
            onChange: handlePromptChange,
          })
        : [],
    [inline, readOnly, isProposing, promptContainer, handlePromptChange],
  );

  const handleClosePrompt = useCallback(() => {
    const view = ref.current?.view;
    if (view) {
      closeInlinePrompt(view);
    }
  }, []);

  const handleSubmitPrompt = useCallback(
    async (prompt: string) => {
      if (promptPos == null) {
        return;
      }
      setPromptError(undefined);
      const result = await generate({
        prompt,
        source: sourceRef.current,
        cursor: promptPos,
      });
      if (result == null) {
        return;
      }
      if ("message" in result) {
        setPromptError(result.message);
        return;
      }
      handleClosePrompt();
      proposeSource(result.expression, result.name);
    },
    [promptPos, generate, handleClosePrompt, proposeSource],
  );

  const textRequest = useTextRequest({
    source,
    onStart: () => {
      const view = ref.current?.view;
      if (view) {
        closeCompletion(view);
      }
    },
    generate,
    applySource,
    onAcceptName,
    generateRef,
  });
  const { clearError: clearTextRequestError } = textRequest;

  const canAssist = inline && !readOnly;

  // A hint on SQL in the expression replaces the error.
  const sqlHint = useSqlHint({
    hasError: showErrors && error != null,
    source,
    query,
    stageIndex,
    availableColumns,
    isEnabled: canAssist,
    generate,
    proposeSource,
    applySource,
  });

  const parameterHintsExtensions = useParameterHints();

  useCaseCounts({
    getView: getEditorView,
    source,
    query,
    stageIndex,
    expressionIndex,
    expressionMode,
    compile: compileSource,
  });

  // A new list of extensions reconfigures the editor, which drops the fields
  // of an active snippet (CodeMirror adds their state with appendConfig). So
  // the list depends on the text only while the diff shows, and the text does
  // not change then.
  const diffOriginal = isProposing ? source : null;

  const extensions = useMemo(
    () =>
      diffOriginal != null
        ? [
            ...baseExtensions,
            ...parameterHintsExtensions,
            caseCounts,
            unifiedMergeView({ original: diffOriginal, mergeControls: false }),
            ...diffControlsExtensions,
          ]
        : [
            ...baseExtensions,
            ...parameterHintsExtensions,
            caseCounts,
            ...inlinePromptExtensions,
          ],
    [
      diffOriginal,
      baseExtensions,
      diffControlsExtensions,
      inlinePromptExtensions,
      parameterHintsExtensions,
    ],
  );

  const handleSourceChange = useCallback(
    (nextSource: string) => {
      if (isProposing) {
        setProposal(
          (proposal) => proposal && { ...proposal, source: nextSource },
        );
      } else {
        clearTextRequestError();
        onSourceChange(nextSource);
      }
    },
    [isProposing, onSourceChange, clearTextRequestError],
  );

  // Inserts the function with its argument placeholders, the same way
  // autocomplete does, and selects the first one.
  const handleFunctionBrowserClauseClick = useCallback((name: string) => {
    const view = ref.current?.view;
    const clause = getClauseDefinition(name);
    if (!view || !clause) {
      return;
    }

    const { from, to } = view.state.selection.main;
    view.focus();
    insertWithPlaceholders(view, expressionClauseSnippet(clause), from, to);
  }, []);

  const handleTemplateClick = useCallback((code: string) => {
    const view = ref.current?.view;
    if (view) {
      insertExpressionTemplate(view, code);
    }
  }, []);

  const handleColumnClick = useCallback(
    (column: Lib.ColumnMetadata) => {
      const view = ref.current?.view;
      if (!view) {
        return;
      }

      // Same text the autocomplete inserts for a column.
      const { longDisplayName } = Lib.displayInfo(query, stageIndex, column);
      const text = formatIdentifier(longDisplayName);

      view.focus();
      view.dispatch(
        view.state.changeByRange((range) => ({
          range: EditorSelection.cursor(range.from + text.length),
          changes: [{ from: range.from, to: range.to, insert: text }],
        })),
      );
    },
    [query, stageIndex],
  );

  const applyInitialSnippet = useInitialClause({
    initialExpressionClause,
  });
  const handleCreateEditor = useCallback(
    (view: EditorView) => {
      showErrorMarks(view, showErrors);
      applyInitialSnippet(view);
    },
    // Only for the first value: the effect above applies later changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [applyInitialSnippet],
  );

  const [isSnippetActive, setIsSnippetActive] = useState(false);
  const handleUpdate = useCallback((update: ViewUpdate) => {
    setIsSnippetActive(hasActiveSnippet(update.state));
  }, []);

  const canFormat = source.trim() !== "" && error == null && isValidated;

  const closeSidebar = useCallback(
    () => setOpenSidebar(null),
    [setOpenSidebar],
  );

  // The side panel has its own header. The column list uses the sidebar's.
  const sidebarContent =
    openSidebar === "columns" ? (
      <ExpressionSidebarPanel
        title={t`Available columns`}
        onClose={closeSidebar}
      >
        <AvailableColumnsBrowser
          query={query}
          stageIndex={stageIndex}
          availableColumns={availableColumns}
          onColumnClick={handleColumnClick}
        />
      </ExpressionSidebarPanel>
    ) : (
      <ExpressionSidePanel
        expressionMode={expressionMode}
        query={query}
        reportTimezone={reportTimezone}
        onClose={closeSidebar}
        onFunctionClick={handleFunctionBrowserClauseClick}
        onTemplateClick={handleTemplateClick}
      />
    );

  const codeMirror = (
    <CodeMirror
      id={id}
      ref={ref}
      data-testid="custom-expression-query-editor"
      placeholder={
        promptPos != null
          ? undefined
          : inline
            ? t`Type “@” for AI, or expression, SQL code, Excel formula...`
            : t`Type your expression, press '[' for columns…`
      }
      className={S.editor}
      extensions={extensions}
      readOnly={readOnly || isFormatting || textRequest.isLoading}
      value={proposedSource ?? source}
      onChange={handleSourceChange}
      onBlur={isProposing ? undefined : onBlur}
      basicSetup={inline ? INLINE_BASIC_SETUP : undefined}
      height={inline ? undefined : "100%"}
      width="100%"
      indentWithTab={false}
      autoFocus
      onCreateEditor={handleCreateEditor}
      onUpdate={handleUpdate}
      autoCorrect="off"
      tabIndex={0}
      onFormat={
        error === null && isValidated && !isSnippetActive && !isProposing
          ? formatExpression
          : undefined
      }
    />
  );

  return (
    <>
      <LayoutMain
        className={cx(S.wrapper, {
          [S.formatting]: isFormatting,
          [S.textRequest]: textRequest.isLoading,
          [S.inline]: inline,
        })}
      >
        {inline ? (
          <div className={S.inlineRow}>
            {codeMirror}
            <InlineToolbar
              openSidebar={openSidebar}
              start={toolbarStart}
              end={toolbarEnd}
              onToggleSidebar={toggleSidebar}
            />
          </div>
        ) : (
          codeMirror
        )}
        {promptPos != null &&
          createPortal(
            <InlinePrompt
              isLoading={isGenerating}
              onSubmit={handleSubmitPrompt}
              onClose={handleClosePrompt}
            />,
            promptContainer,
          )}
        {proposal != null && (
          <ExpressionDiffControls
            portalTarget={portalTarget}
            shortcuts={diffShortcuts}
            name={proposal.name}
            onNameChange={handleProposedNameChange}
            onAcceptProposed={handleAcceptProposed}
            onRejectProposed={handleRejectProposed}
          />
        )}
        {promptPos != null ? (
          <InlinePromptStatus isLoading={isGenerating} error={promptError} />
        ) : (
          textRequest.isShown && (
            <InlinePromptStatus
              isLoading={textRequest.isLoading}
              error={textRequest.error}
            />
          )
        )}
        <Errors
          error={
            !showErrors ||
            isSnippetActive ||
            isProposing ||
            promptPos != null ||
            textRequest.isShown
              ? null
              : error
          }
          source={source}
          content={sqlHint}
          inline={inline}
        />

        {!inline && source.trim() === "" && !isFormatting && error == null && (
          <Shortcuts shortcuts={shortcuts} className={S.shortcuts} />
        )}

        {!inline && (
          <Flex
            className={S.toolbar}
            gap="sm"
            pt="sm"
            pr="sm"
            direction="column"
          >
            <ButtonTooltip label={t`Function browser`}>
              <ActionIcon
                aria-label={t`Function browser`}
                aria-pressed={openSidebar === "functions"}
                onClick={() => toggleSidebar("functions")}
                variant={openSidebar === "functions" ? "filled" : "subtle"}
              >
                <Icon name="function" />
              </ActionIcon>
            </ButtonTooltip>
            <ButtonTooltip label={t`Available columns`}>
              <ActionIcon
                aria-label={t`Available columns`}
                aria-pressed={openSidebar === "columns"}
                onClick={() => toggleSidebar("columns")}
                variant={openSidebar === "columns" ? "filled" : "subtle"}
              >
                <Icon name="list" />
              </ActionIcon>
            </ButtonTooltip>
            {canFormat && (
              <ButtonTooltip label={t`Auto-format`}>
                <ActionIcon
                  variant="subtle"
                  aria-label={t`Auto-format`}
                  onClick={formatExpression}
                  disabled={isFormatting}
                >
                  <Icon name="format_code" />
                </ActionIcon>
              </ButtonTooltip>
            )}
          </Flex>
        )}

        {/* The help popup would cover the diff controls and the prompt. */}
        {!isProposing && promptPos == null && portal}
      </LayoutMain>

      {openSidebar != null &&
        (host?.container ? (
          createPortal(sidebarContent, host.container)
        ) : (
          <LayoutSidebar h={hasHeader ? FB_HEIGHT_WITH_HEADER : FB_HEIGHT}>
            {sidebarContent}
          </LayoutSidebar>
        ))}

      {showModal && (
        <CloseModal
          onKeepEditing={closeModal}
          onDiscardChanges={onCloseEditor}
        />
      )}
    </>
  );
}

function useExpression({
  clause,
  initialSource: seedSource,
  expressionMode,
  stageIndex,
  expressionIndex,
  query,
  availableColumns,
  availableMetrics,
  database,
  onChange,
  onEdit,
  initialClause,
}: EditorProps & {
  database: Pick<Database, "features"> | undefined;
}) {
  const [source, setSource] = useState("");
  const [initialSource, setInitialSource] = useState("");
  // CodeMirror reports the formatted source before the state above settles.
  const initialSourceRef = useRef("");
  const [isFormatting, setIsFormatting] = useState(true);
  const [isValidated, setIsValidated] = useState(false);
  const errorRef = useRef<ExpressionError | null>(null);

  const formatExpression = useCallback(
    ({ initial = false }: { initial?: boolean }) => {
      function done(source: string) {
        setIsFormatting(false);
        setSource(source);
        if (initial) {
          setInitialSource(source);
          initialSourceRef.current = source;
        }
      }

      if (clause == null) {
        done("");
        return;
      }

      format(clause, {
        query,
        stageIndex,
        availableColumns,
        printWidth: 55, // 60 is the width of the editor
      })
        .catch(() => "")
        .then(done);
    },
    [clause, query, stageIndex, availableColumns],
  );

  const handleChange = useCallback<typeof onChange>(
    (clause, error, meta) => {
      setIsValidated(true);
      errorRef.current = error;
      onChange(clause, error, meta);
    },
    [onChange],
  );

  const debouncedOnChange = useMemo(
    () => _.debounce(handleChange, DEBOUNCE_VALIDATION_MS, false),
    [handleChange],
  );

  const handleUpdate = useCallback(
    (source: string, immediate: boolean = false) => {
      setSource(source);
      setIsValidated(false);

      const meta = {
        hasSourceChanged: source !== initialSourceRef.current,
        source,
      };

      if (source.trim() === "") {
        debouncedOnChange.cancel();
        onEdit?.(source, null);
        handleChange(null, null, meta);
        return { clause: null, error: null };
      }

      const { error, expressionClause: clause } = diagnoseAndCompile({
        source,
        expressionMode,
        query,
        stageIndex,
        expressionIndex,
        database,
        availableColumns,
        availableMetrics,
      });
      onEdit?.(source, error == null ? (clause ?? null) : null);
      if (immediate || errorRef.current) {
        debouncedOnChange.cancel();
        handleChange(clause, error, meta);
      } else {
        debouncedOnChange(clause, error, meta);
      }
      return { clause: clause ?? null, error };
    },
    [
      query,
      stageIndex,
      expressionMode,
      expressionIndex,
      database,
      handleChange,
      debouncedOnChange,
      availableColumns,
      availableMetrics,
      onEdit,
    ],
  );

  useMount(() => {
    if (seedSource != null) {
      // Restored text may not compile; validate so its errors show at once.
      setIsFormatting(false);
      setInitialSource(seedSource);
      initialSourceRef.current = seedSource;
      handleUpdate(seedSource, true);
      return;
    }

    formatExpression({
      initial: clause === initialClause,
    });
  });

  // Once the opened expression finishes formatting, validate it so the compiled
  // clause reaches the widget and keeps the submit button enabled. We cannot
  // wait for CodeMirror to report the formatted value as a change: that signal
  // is unreliable under React 19's effect timing, which is what left the editor
  // looking populated while the widget still had no clause.
  const hasPropagatedInitialClause = useRef(false);
  useEffect(() => {
    if (isFormatting || hasPropagatedInitialClause.current) {
      return;
    }
    // Formatting has settled, so the initial clause (if any) is now in `source`.
    // Mark it handled whether or not it had content, otherwise an editor that
    // opened empty would treat the user's first keystroke as the initial clause
    // and validate it at once, defeating the debounce on every later keystroke.
    hasPropagatedInitialClause.current = true;
    if (source.trim() !== "") {
      handleUpdate(source, true);
    }
  }, [isFormatting, source, handleUpdate]);

  const handleSourceChange = useCallback(
    (source: string) => {
      // While the initial expression is still being formatted the editor holds
      // the transient empty document, and CodeMirror reports that as a change.
      // Treating it as a user edit emits `onChange(null)` and clears the valid
      // clause the widget opened with, which React 19's effect timing lets race
      // ahead of the formatted value landing. Ignore changes until formatting
      // settles; real edits only happen afterwards.
      if (isFormatting) {
        return;
      }
      handleUpdate(source, false);
    },
    [handleUpdate, isFormatting],
  );

  const handleBlur = useCallback(() => {
    // `source` is stale until formatting settles; updating now would overwrite
    // the formatted result. Blur also fires when focus leaves for the
    // aggregation name field: until the user edits the expression the opened
    // clause still stands, so an unedited source (which under React 19 can be
    // the empty document a failed initial format left behind) must not
    // propagate and clear that clause.
    if (isFormatting || source === initialSource) {
      return;
    }
    handleUpdate(source, true);
  }, [handleUpdate, source, initialSource, isFormatting]);

  const handleFormatExpression = useCallback(() => {
    formatExpression({ initial: false });
  }, [formatExpression]);

  const acceptSource = useCallback(
    (source: string) => handleUpdate(source, true),
    [handleUpdate],
  );

  const sourceRef = useRef(source);
  sourceRef.current = source;
  const validateNow = useCallback(() => {
    const source = sourceRef.current;
    return { source, ...handleUpdate(source, true) };
  }, [handleUpdate]);

  return {
    source,
    initialSource,
    hasSourceChanged: source !== initialSource,
    onSourceChange: handleSourceChange,
    onBlur: handleBlur,
    formatExpression: handleFormatExpression,
    isFormatting,
    isValidated,
    acceptSource,
    validateNow,
  };
}

/**
 * Reports the proposed text, its clause and the proposed name. It compiles
 * the text only when the proposal changes.
 */
/** Sends the whole text to the AI as a request, when it is not an expression. */
function useTextRequest({
  source,
  onStart,
  generate,
  applySource,
  onAcceptName,
  generateRef,
}: {
  source: string;
  onStart: () => void;
  generate: ReturnType<typeof useGenerateExpression>["generate"];
  applySource: (source: string) => Promise<unknown>;
  onAcceptName?: (name: string) => void;
  generateRef?: MutableRefObject<GenerateNow | null>;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>();
  const sourceRef = useRef(source);
  sourceRef.current = source;

  const run = useCallback(async () => {
    const prompt = sourceRef.current.trim();
    if (prompt === "") {
      return;
    }
    setError(undefined);
    setIsLoading(true);
    onStart();
    const result = await generate({ prompt, source: "" });
    setIsLoading(false);
    if (result == null) {
      return;
    }
    if ("message" in result) {
      setError(result.message);
      return;
    }
    if (result.name?.trim()) {
      onAcceptName?.(result.name.trim());
    }
    await applySource(result.expression);
  }, [generate, applySource, onAcceptName, onStart]);

  const clearError = useCallback(() => setError(undefined), []);

  if (generateRef) {
    generateRef.current = run;
  }

  return {
    isLoading,
    error,
    clearError,
    isShown: isLoading || error != null,
  };
}

// A diff helps only when the AI rewrites a part of a long expression.
const COMPLEX_SOURCE_LENGTH = 120;
const COMPLEX_CHANGE_LENGTH = 20;

/**
 * True when the AI suggestion rewrites much of a long expression. Whitespace
 * and letter case do not count, because the editor formats the suggestion,
 * for example "and" to "AND".
 */
function isComplexEdit(before: string, after: string) {
  const normalize = (source: string) =>
    source.replace(/\s+/g, "").toLowerCase();
  const a = normalize(before);
  const b = normalize(after);
  if (a.length < COMPLEX_SOURCE_LENGTH) {
    return false;
  }
  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) {
    prefix++;
  }
  let suffix = 0;
  while (
    suffix < a.length - prefix &&
    suffix < b.length - prefix &&
    a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
  ) {
    suffix++;
  }
  // The text of the old expression that the suggestion removes or rewrites.
  const changedLength = a.length - prefix - suffix;
  return changedLength >= COMPLEX_CHANGE_LENGTH;
}

function useReportProposal(
  proposal: Proposal | null,
  compileSource: (source: string) => Lib.ExpressionClause | null,
  onProposalChange: EditorProps["onProposalChange"],
) {
  const latestRef = useRef({ compileSource, onProposalChange });
  latestRef.current = { compileSource, onProposalChange };
  const source = proposal?.source;
  const name = proposal?.name?.trim() || undefined;
  useEffect(() => {
    const { compileSource, onProposalChange } = latestRef.current;
    onProposalChange?.(
      source == null ? null : { source, clause: compileSource(source), name },
    );
  }, [source, name]);
}

function getTooltipPosition(state: EditorState) {
  const pos = state.selection.main.head;
  const source = state.doc.toString();
  let token = tokenAtPos(source, pos);
  if (pos > 0 && token && (token.type === COMMA || token.type === GROUP)) {
    // when we're `,` or `(`, return the previous token instead
    token = tokenAtPos(source, pos - 1);
  }

  return token?.start ?? pos;
}
