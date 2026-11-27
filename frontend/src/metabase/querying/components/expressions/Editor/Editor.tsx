import { EditorSelection, type EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import type { ViewUpdate } from "@uiw/react-codemirror";
import cx from "classnames";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  dismissSuggestionsOrPlaceholders,
  format,
  formatIdentifier,
  insertExpressionTemplate,
  tokenAtPos,
} from "metabase/querying/expressions";
import { COMMA, GROUP } from "metabase/querying/expressions/pratt";
import { ActionIcon, Tooltip as ButtonTooltip, Flex, Icon } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { Database } from "metabase-types/api";

import { AvailableColumnsBrowser } from "../AvailableColumnsBrowser";
import { ExpressionSidePanel } from "../ExpressionSidePanel";
import type { ExpressionSidebarName } from "../ExpressionSidebar";
import { ExpressionSidebarPanel } from "../ExpressionSidebar";
import { LayoutMain, LayoutSidebar } from "../Layout";

import { CloseModal, useCloseModal } from "./CloseModal";
import S from "./Editor.module.css";
import { Errors } from "./Errors";
import type { Shortcut } from "./Shortcuts";
import { Shortcuts } from "./Shortcuts";
import { Tooltip } from "./Tooltip";
import { useColumnHover } from "./column-hover";
import { DEBOUNCE_VALIDATION_MS } from "./constants";
import { useCustomTooltip } from "./custom-tooltip";
import { useExtensions } from "./extensions";
import { useEditorSidebar } from "./use-editor-sidebar";
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

  onChange: (
    clause: Lib.ExpressionClause | null,
    error: ExpressionError | null,
    meta: EditorChangeMeta,
  ) => void;
  shortcuts?: Shortcut[];
};

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
  } = props;

  const ref = useRef<CodeMirrorRef>(null);
  const databaseId = Lib.databaseID(query);
  const { data: database } = useGetDatabaseQuery(
    databaseId != null ? { id: databaseId } : skipToken,
  );
  const { host, openSidebar, setOpenSidebar } = useEditorSidebar();

  // A filter or summary popover closes on Escape before the code gets the
  // key. Escape first closes the suggestions, then leaves the placeholders,
  // and only then reaches the popover. The window's capture phase comes
  // before the popover's handler.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const view = ref.current?.view;
      const isInCode =
        view != null &&
        event.target instanceof Node &&
        view.contentDOM.contains(event.target);
      if (
        event.key === "Escape" &&
        isInCode &&
        dismissSuggestionsOrPlaceholders(view)
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () =>
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, []);

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
  } = useExpression({
    ...props,
    database,
    error,
  });

  const { showModal, closeModal } = useCloseModal({
    allowPopoverExit: source === "" || !hasSourceChanged,
  });

  const [columnHover, columnHoverCard] = useColumnHover({
    query,
    stageIndex,
    availableColumns,
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

  const extensions = useExtensions({
    expressionMode,
    query,
    stageIndex,
    availableColumns,
    availableMetrics,
    database,
    extensions: [customTooltip, columnHover],
  });

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
    (view: EditorView) => applyInitialSnippet(view),
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
        onTemplateClick={handleTemplateClick}
      />
    );

  return (
    <>
      <LayoutMain
        className={cx(S.wrapper, {
          [S.formatting]: isFormatting,
        })}
      >
        <CodeMirror
          id={id}
          ref={ref}
          data-testid="custom-expression-query-editor"
          placeholder={t`Type your expression, press '[' for columns…`}
          className={S.editor}
          extensions={extensions}
          readOnly={readOnly || isFormatting}
          value={source}
          onChange={onSourceChange}
          onBlur={onBlur}
          height="100%"
          width="100%"
          indentWithTab={false}
          // Also the brackets around column names.
          matchBrackets="()[]"
          autoFocus
          onCreateEditor={handleCreateEditor}
          onUpdate={handleUpdate}
          autoCorrect="off"
          tabIndex={0}
          onFormat={
            error === null && isValidated && !isSnippetActive
              ? formatExpression
              : undefined
          }
        />
        <Errors error={isSnippetActive ? null : error} source={source} />

        {source.trim() === "" && !isFormatting && error == null && (
          <Shortcuts shortcuts={shortcuts} className={S.shortcuts} />
        )}

        <Flex className={S.toolbar} gap="sm" pt="sm" pr="sm" direction="column">
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

        {portal}
        {columnHoverCard}
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
    ],
  );

  useMount(() => {
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

  return {
    source,
    initialSource,
    hasSourceChanged: source !== initialSource,
    onSourceChange: handleSourceChange,
    onBlur: handleBlur,
    formatExpression: handleFormatExpression,
    isFormatting,
    isValidated,
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
