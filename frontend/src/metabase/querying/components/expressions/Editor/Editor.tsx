import { unifiedMergeView } from "@codemirror/merge";
import { EditorSelection, type EditorState } from "@codemirror/state";
import type { ViewUpdate } from "@uiw/react-codemirror";
import cx from "classnames";
import {
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
  format,
  formatIdentifier,
  getClauseDefinition,
  tokenAtPos,
} from "metabase/querying/expressions";
import { COMMA, GROUP } from "metabase/querying/expressions/pratt";
import { ActionIcon, Tooltip as ButtonTooltip, Flex, Icon } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { Database } from "metabase-types/api";

import { useDiffControls } from "../../CodeMirrorEditor/use-diff-controls";
import { AvailableColumnsBrowser } from "../AvailableColumnsBrowser";
import type { ExpressionSidebarName } from "../ExpressionSidebar";
import {
  ExpressionSidebarPanel,
  useExpressionSidebarHost,
} from "../ExpressionSidebar";
import { FunctionBrowser } from "../FunctionBrowser";
import { useGenerateExpression } from "../GenerateExpressionPrompt";
import { LayoutMain, LayoutSidebar } from "../Layout";

import { CloseModal, useCloseModal } from "./CloseModal";
import S from "./Editor.module.css";
import { Errors } from "./Errors";
import { ExpressionDiffControls } from "./ExpressionDiffControls";
import { useFixErrorAction } from "./FixErrorAction";
import { InlinePrompt } from "./InlinePrompt";
import { InlineToolbar } from "./InlineToolbar";
import type { Shortcut } from "./Shortcuts";
import { Shortcuts } from "./Shortcuts";
import { Tooltip } from "./Tooltip";
import { DEBOUNCE_VALIDATION_MS } from "./constants";
import { describeCursor, getColumnType } from "./cursor-context";
import { useCustomTooltip } from "./custom-tooltip";
import { useExtensions } from "./extensions";
import { closeInlinePrompt, inlinePrompt } from "./inline-prompt";
import { getFunctionList } from "./on-device-completion";
import { useParameterHints } from "./parameter-hints";
import { useAiCompletion } from "./use-ai-completion";
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

  /** Rendered in the inline toolbar. */
  renderShortcutsMenu?: (helpers: ShortcutsMenuHelpers) => ReactNode;
  /** The column name, which the AI completion uses as a hint. */
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
  shortcuts?: Shortcut[];
};

export type ShortcutsMenuHelpers = {
  getSource: () => string;
  /** Returns the error for `source`, or null when it is valid. */
  validate: (source: string) => string | null;
  /**
   * Show `source` as a diff against the current text, to accept or reject.
   * `name` is a suggested column name that the user can change.
   */
  proposeSource: (source: string, name?: string) => void;
};

type Proposal = { source: string; name?: string };

export type EditorChangeMeta = {
  /** False for the initial format pass, so autosaving callers can skip it. */
  hasSourceChanged: boolean;
  /** The raw text, which a caller can stash to restore later. */
  source: string;
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
    renderShortcutsMenu,
    name,
    hasDefaultName = false,
    onAcceptName,
  } = props;

  const ref = useRef<CodeMirrorRef>(null);
  const databaseId = Lib.databaseID(query);
  const { data: database } = useGetDatabaseQuery(
    databaseId != null ? { id: databaseId } : skipToken,
  );
  const [localSidebar, setLocalSidebar] =
    useState<ExpressionSidebarName | null>(null);

  const sidebarHost = useExpressionSidebarHost();
  const host = inline ? sidebarHost : null;

  const openSidebar = host ? host.openSidebar : localSidebar;
  const setOpenSidebar = host ? host.setOpenSidebar : setLocalSidebar;

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
        expressionMode={expressionMode}
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

  // An AI suggestion, shown as a diff against `source` until accepted or rejected.
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const proposedSource = proposal?.source ?? null;
  const isProposing = proposal != null;

  const sourceRef = useRef(source);
  sourceRef.current = source;
  const getSource = useCallback(() => sourceRef.current, []);

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

  // A hook for the script that tests prompts for the on-device completion.
  useEffect(() => {
    const columns = availableColumns.map((column) => ({
      name: formatIdentifier(
        Lib.displayInfo(query, stageIndex, column).longDisplayName,
      ),
      type: getColumnType(column),
    }));
    const debug = {
      validate,
      functionList: getFunctionList({ expressionMode, database }),
      columns,
      describeCursor: (prefix: string) => describeCursor(prefix, columns),
    };
    Object.assign(window, { __expressionEditorDebug: debug });
  }, [validate, expressionMode, database, availableColumns, query, stageIndex]);

  // Formats an AI suggestion like the format button does. A source that does
  // not compile stays as it is, so that the editor can show its error.
  const formatProposedSource = useCallback(
    async (source: string) => {
      const { expressionClause } = diagnoseAndCompile({
        source,
        expressionMode,
        query,
        stageIndex,
        expressionIndex,
        database,
        availableColumns,
        availableMetrics,
      });
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

  const proposeSource = useCallback(
    async (source: string, name?: string) => {
      const formatted = await formatProposedSource(source);
      setProposal({ source: formatted, name });
      requestAnimationFrame(() => ref.current?.view?.focus());
    },
    [formatProposedSource],
  );

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
  }, [proposal, acceptSource, onAcceptName]);

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

  const fixError = useFixErrorAction({
    error,
    source,
    isEnabled: inline && !readOnly,
    generate,
    proposeSource,
  });

  const aiCompletionExtensions = useAiCompletion({
    query,
    stageIndex,
    expressionMode,
    availableColumns,
    name,
    database,
    validate,
    isEnabled: inline && !readOnly && !isProposing,
  });

  const parameterHintsExtensions = useParameterHints();

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
            unifiedMergeView({ original: diffOriginal, mergeControls: false }),
            ...diffControlsExtensions,
          ]
        : [
            ...baseExtensions,
            ...parameterHintsExtensions,
            ...aiCompletionExtensions,
            ...inlinePromptExtensions,
          ],
    [
      diffOriginal,
      baseExtensions,
      diffControlsExtensions,
      aiCompletionExtensions,
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
        onSourceChange(nextSource);
      }
    },
    [isProposing, onSourceChange],
  );

  const handleFunctionBrowserClauseClick = useCallback((name: string) => {
    const view = ref.current?.view;
    if (!view) {
      return;
    }
    const clause = getClauseDefinition(name);
    if (!clause) {
      return;
    }

    const text = `${clause.displayName}()`;
    const len = clause.displayName.length + 1; // + 1 for the parenthesis

    view?.focus();
    view?.dispatch(
      view.state.changeByRange((range) => ({
        range: EditorSelection.cursor(range.from + len),
        changes: [{ from: range.from, to: range.to, insert: text }],
      })),
    );
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

  const [isSnippetActive, setIsSnippetActive] = useState(false);
  const handleUpdate = useCallback((update: ViewUpdate) => {
    setIsSnippetActive(hasActiveSnippet(update.state));
  }, []);

  const canFormat = source.trim() !== "" && error == null && isValidated;

  const sidebarTitle =
    openSidebar === "columns"
      ? t`Available columns`
      : t`Custom expression functions`;

  const sidebarContent =
    openSidebar === "columns" ? (
      <AvailableColumnsBrowser
        query={query}
        stageIndex={stageIndex}
        availableColumns={availableColumns}
        onColumnClick={handleColumnClick}
      />
    ) : (
      <FunctionBrowser
        expressionMode={expressionMode}
        reportTimezone={reportTimezone}
        query={query}
        onClauseClick={handleFunctionBrowserClauseClick}
      />
    );

  return (
    <>
      <LayoutMain
        className={cx(S.wrapper, {
          [S.formatting]: isFormatting,
          [S.inline]: inline,
        })}
      >
        <CodeMirror
          id={id}
          ref={ref}
          data-testid="custom-expression-query-editor"
          placeholder={
            promptPos == null
              ? t`Type your expression, press '[' for columns…`
              : undefined
          }
          className={S.editor}
          extensions={extensions}
          readOnly={readOnly || isFormatting}
          value={proposedSource ?? source}
          onChange={handleSourceChange}
          onBlur={isProposing ? undefined : onBlur}
          height="100%"
          width="100%"
          indentWithTab={false}
          autoFocus
          onCreateEditor={applyInitialSnippet}
          onUpdate={handleUpdate}
          autoCorrect="off"
          tabIndex={0}
          onFormat={
            error === null && isValidated && !isSnippetActive && !isProposing
              ? formatExpression
              : undefined
          }
        />
        {promptPos != null &&
          createPortal(
            <InlinePrompt
              isLoading={isGenerating}
              error={promptError}
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
        <Errors
          error={
            isSnippetActive || isProposing || promptPos != null ? null : error
          }
          source={source}
          action={fixError.action}
          note={fixError.note}
        />

        {!inline && source.trim() === "" && !isFormatting && error == null && (
          <Shortcuts shortcuts={shortcuts} className={S.shortcuts} />
        )}

        {inline ? (
          <InlineToolbar
            canFormat={
              source.trim() !== "" &&
              error == null &&
              (isValidated || !hasSourceChanged) &&
              !isFormatting &&
              !isProposing
            }
            openSidebar={openSidebar}
            shortcutsMenu={renderShortcutsMenu?.({
              getSource,
              validate,
              proposeSource,
            })}
            onFormat={formatExpression}
            onToggleSidebar={toggleSidebar}
          />
        ) : (
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
          createPortal(
            <ExpressionSidebarPanel
              title={sidebarTitle}
              onClose={() => setOpenSidebar(null)}
            >
              {sidebarContent}
            </ExpressionSidebarPanel>,
            host.container,
          )
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
        handleChange(null, null, meta);
        return;
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
      if (immediate || errorRef.current) {
        debouncedOnChange.cancel();
        handleChange(clause, error, meta);
      } else {
        debouncedOnChange(clause, error, meta);
      }
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
  };
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
