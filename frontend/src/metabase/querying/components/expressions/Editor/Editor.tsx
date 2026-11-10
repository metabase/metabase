import { snippet } from "@codemirror/autocomplete";
import { type EditorState, Prec } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { useDisclosure } from "@mantine/hooks";
import type { ViewUpdate } from "@uiw/react-codemirror";
import cx from "classnames";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLatest, useMount } from "react-use";
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
  getClauseDefinition,
  insertExpressionTemplate,
  tokenAtPos,
} from "metabase/querying/expressions";
import { COMMA, GROUP } from "metabase/querying/expressions/pratt";
import {
  ActionIcon,
  Button,
  Tooltip as ButtonTooltip,
  Flex,
  Icon,
} from "metabase/ui";
import * as Lib from "metabase-lib";
import type { Database } from "metabase-types/api";

import { ExpressionSidePanel } from "../ExpressionSidePanel";
import { FunctionBrowser } from "../FunctionBrowser";
import { LayoutMain, LayoutSidebar } from "../Layout";

import { CloseModal, useCloseModal } from "./CloseModal";
import S from "./Editor.module.css";
import { Errors } from "./Errors";
import type { Shortcut } from "./Shortcuts";
import { Shortcuts } from "./Shortcuts";
import { Tooltip } from "./Tooltip";
import { DEBOUNCE_VALIDATION_MS } from "./constants";
import { useCustomTooltip } from "./custom-tooltip";
import { useExtensions } from "./extensions";
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
  inline?: boolean;
  onCloseEditor?: () => void;
  initialExpressionClause?: Lib.DefinedClauseName | null;
  /** Called with a name for an expression a side panel tool built. */
  onSuggestName?: (name: string) => void;
  /** Cmd/Ctrl+Enter: called with the expression as typed, checked right away. */
  onSubmit?: (
    clause: Lib.ExpressionClause | null,
    error: ExpressionError | null,
  ) => void;

  onChange: (
    clause: Lib.ExpressionClause | null,
    error: ExpressionError | null,
  ) => void;
  shortcuts?: Shortcut[];
};

// The notebook editor has no line numbers or code folding.
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
    stageIndex,
    query,
    availableColumns,
    availableMetrics,
    readOnly,
    error,
    reportTimezone,
    shortcuts,
    hasHeader,
    inline,
    onCloseEditor,
    initialExpressionClause,
    onSuggestName,
    onSubmit,
  } = props;

  const ref = useRef<CodeMirrorRef>(null);
  const databaseId = Lib.databaseID(query);
  const { data: database } = useGetDatabaseQuery(
    databaseId != null ? { id: databaseId } : skipToken,
  );
  const [isFunctionBrowserOpen, { toggle: toggleFunctionBrowser }] =
    useDisclosure();

  const {
    source,
    hasSourceChanged,
    onSourceChange,
    onBlur,
    formatExpression,
    isFormatting,
    isValidated,
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
        expressionMode={expressionMode}
        {...props}
      />
    ),
  });

  // Cmd/Ctrl+Enter submits what's typed now, without waiting for the
  // check that runs after typing pauses.
  const latestSubmit = useLatest((source: string) => {
    if (!onSubmit || readOnly || isFormatting) {
      return;
    }
    const { clause, error } = validateNow(source);
    onSubmit(clause, error);
  });
  const submitShortcut = useMemo(
    () =>
      Prec.highest(
        keymap.of([
          {
            key: "Mod-Enter",
            run: (view) => {
              latestSubmit.current(view.state.doc.toString());
              return true;
            },
          },
        ]),
      ),
    [latestSubmit],
  );

  const extensions = useExtensions({
    expressionMode,
    query,
    stageIndex,
    availableColumns,
    availableMetrics,
    database,
    extensions: [customTooltip, submitShortcut],
  });

  // Inserts the function with its argument placeholders, the same way the
  // suggestions and typing `(` do, and selects the first one.
  const handleFunctionBrowserClauseClick = useCallback((name: string) => {
    const view = ref.current?.view;
    const clause = getClauseDefinition(name);
    if (!view || !clause) {
      return;
    }

    const { from, to } = view.state.selection.main;
    view.focus();
    snippet(expressionClauseSnippet(clause))(view, null, from, to);
  }, []);

  const handleTemplateClick = useCallback((code: string) => {
    const view = ref.current?.view;
    if (view) {
      insertExpressionTemplate(view, code);
    }
  }, []);

  // Inserts what a side panel tool built at the cursor, like a template.
  const handleToolSubmit = useCallback(
    async (clause: Lib.ExpressionClause, name: string) => {
      const source = await format(clause, {
        query,
        stageIndex,
        availableColumns,
        printWidth: 55,
      }).catch(() => null);
      const view = ref.current?.view;
      if (source == null || !view) {
        return;
      }

      view.focus();
      view.dispatch(view.state.replaceSelection(source));
      onSuggestName?.(name);
    },
    [query, stageIndex, availableColumns, onSuggestName],
  );

  const applyInitialSnippet = useInitialClause({
    initialExpressionClause,
  });

  const [isSnippetActive, setIsSnippetActive] = useState(false);
  const handleUpdate = useCallback((update: ViewUpdate) => {
    setIsSnippetActive(hasActiveSnippet(update.state));
  }, []);

  // CodeMirror reloads its settings whenever these handlers change, and a
  // reload ends a template being filled in. Keep them stable, and read the
  // latest values when they run.
  const latest = useLatest({
    canFormat: error === null && isValidated && !isSnippetActive,
    formatExpression,
    onSourceChange,
  });
  const handleFormat = useCallback(() => {
    if (latest.current.canFormat) {
      latest.current.formatExpression();
    }
  }, [latest]);
  const handleSourceChange = useCallback(
    (value: string) => latest.current.onSourceChange(value),
    [latest],
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
            inline
              ? t`Start typing or ask AI for help...`
              : t`Type your expression, press '[' for columns…`
          }
          className={cx(S.editor, { [S.inline]: inline })}
          basicSetup={inline ? INLINE_BASIC_SETUP : undefined}
          extensions={extensions}
          readOnly={readOnly || isFormatting}
          value={source}
          onChange={handleSourceChange}
          onBlur={onBlur}
          height="100%"
          width="100%"
          indentWithTab={false}
          autoFocus
          onCreateEditor={applyInitialSnippet}
          onUpdate={handleUpdate}
          autoCorrect="off"
          tabIndex={0}
          onFormat={handleFormat}
        />
        <Errors error={isSnippetActive ? null : error} />

        {source.trim() === "" && !isFormatting && error == null && (
          <Shortcuts shortcuts={shortcuts} className={S.shortcuts} />
        )}

        <Flex className={S.toolbar} gap="sm" pt="sm" pr="sm" direction="column">
          {!inline && (
            <ButtonTooltip label={t`Function browser`}>
              <Button
                aria-label={t`Function browser`}
                onClick={toggleFunctionBrowser}
                size="sm"
                variant={isFunctionBrowserOpen ? "filled" : "subtle"}
                className={S.toolbarButton}
                leftSection={<Icon name="function" />}
              />
            </ButtonTooltip>
          )}
          {source.trim() !== "" && error == null && isValidated && (
            <ButtonTooltip label={t`Auto-format`}>
              <ActionIcon
                variant="subtle"
                aria-label={t`Auto-format`}
                onClick={formatExpression}
                className={S.toolbarButton}
                disabled={isFormatting || error != null}
              >
                <Icon name="format_code" />
              </ActionIcon>
            </ButtonTooltip>
          )}
        </Flex>

        {portal}
      </LayoutMain>

      {inline && (
        <LayoutSidebar>
          <ExpressionSidePanel
            expressionMode={expressionMode}
            reportTimezone={reportTimezone}
            query={query}
            stageIndex={stageIndex}
            availableColumns={availableColumns}
            onClauseClick={handleFunctionBrowserClauseClick}
            onTemplateClick={handleTemplateClick}
            onToolSubmit={handleToolSubmit}
          />
        </LayoutSidebar>
      )}

      {!inline && isFunctionBrowserOpen && (
        <LayoutSidebar h={hasHeader ? FB_HEIGHT_WITH_HEADER : FB_HEIGHT}>
          <FunctionBrowser
            expressionMode={expressionMode}
            reportTimezone={reportTimezone}
            query={query}
            onClauseClick={handleFunctionBrowserClauseClick}
          />
        </LayoutSidebar>
      )}

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
    (clause, error) => {
      setIsValidated(true);
      errorRef.current = error;
      onChange(clause, error);
    },
    [onChange],
  );

  const debouncedOnChange = useMemo(
    () => _.debounce(handleChange, DEBOUNCE_VALIDATION_MS, false),
    [handleChange],
  );

  const compile = useCallback(
    (source: string) =>
      diagnoseAndCompile({
        source,
        expressionMode,
        query,
        stageIndex,
        expressionIndex,
        database,
        availableColumns,
        availableMetrics,
      }),
    [
      query,
      stageIndex,
      expressionMode,
      expressionIndex,
      database,
      availableColumns,
      availableMetrics,
    ],
  );

  const validateNow = useCallback(
    (source: string) => {
      debouncedOnChange.cancel();
      if (source.trim() === "") {
        handleChange(null, null);
        return { clause: null, error: null };
      }
      const { error, expressionClause: clause } = compile(source);
      handleChange(clause, error);
      return { clause, error };
    },
    [compile, debouncedOnChange, handleChange],
  );

  const handleUpdate = useCallback(
    (source: string, immediate: boolean = false) => {
      setSource(source);
      setIsValidated(false);

      if (source.trim() === "") {
        debouncedOnChange.cancel();
        handleChange(null, null);
        return;
      }

      const { error, expressionClause: clause } = compile(source);
      if (immediate || errorRef.current) {
        debouncedOnChange.cancel();
        handleChange(clause, error);
      } else {
        debouncedOnChange(clause, error);
      }
    },
    [compile, handleChange, debouncedOnChange],
  );

  useMount(() => {
    // format the source when the component mounts
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
    validateNow,
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
