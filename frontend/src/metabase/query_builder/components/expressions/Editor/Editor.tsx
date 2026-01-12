import { EditorSelection, type EditorState } from "@codemirror/state";
import { useDisclosure } from "@mantine/hooks";
import type { ViewUpdate } from "@uiw/react-codemirror";
import cx from "classnames";
import { useCallback, useMemo, useRef, useState } from "react";
import { useMount } from "react-use";
import { t } from "ttag";
import _ from "underscore";

import {
  CodeMirror,
  type CodeMirrorRef,
} from "metabase/common/components/CodeMirror";
import { useSelector } from "metabase/lib/redux";
import {
  type DefinedClauseName,
  type ExpressionError,
  diagnoseAndCompile,
  format,
  getClauseDefinition,
} from "metabase/querying/expressions";
import { tokenAtPos } from "metabase/querying/expressions";
import { COMMA, GROUP } from "metabase/querying/expressions/pratt";
import { getMetadata } from "metabase/selectors/metadata";
import { Button, Tooltip as ButtonTooltip, Flex, Icon } from "metabase/ui";
import type * as Lib from "metabase-lib";
import type Metadata from "metabase-lib/v1/metadata/Metadata";

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

type EditorProps = {
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
  initialExpressionClause?: DefinedClauseName | null;

  onChange: (
    clause: Lib.ExpressionClause | null,
    error: ExpressionError | null,
  ) => void;
  shortcuts?: Shortcut[];
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
  const metadata = useSelector(getMetadata);
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
  } = useExpression({
    ...props,
    metadata,
    error,
  });

  const { showModal, closeModal } = useCloseModal({
    allowPopoverExit: source === "" || !hasSourceChanged,
  });

  const [customTooltip, portal] = useCustomTooltip({
    getPosition: getTooltipPosition,
    render: (props) => (
      <Tooltip
        query={query}
        stageIndex={stageIndex}
        metadata={metadata}
        reportTimezone={reportTimezone}
        expressionMode={expressionMode}
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
    metadata,
    extensions: [customTooltip],
  });

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

  const applyInitialSnippet = useInitialClause({
    initialExpressionClause,
  });

  const [isSnippetActive, setIsSnippetActive] = useState(false);
  const handleUpdate = useCallback((update: ViewUpdate) => {
    setIsSnippetActive(hasActiveSnippet(update.state));
  }, []);

  return (
    <>
      <LayoutMain className={cx(S.wrapper, { [S.formatting]: isFormatting })}>
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
          autoFocus
          onCreateEditor={applyInitialSnippet}
          onUpdate={handleUpdate}
          autoCorrect="off"
          tabIndex={0}
          onFormat={
            error === null && isValidated && !isSnippetActive
              ? formatExpression
              : undefined
          }
        />
        <Errors error={isSnippetActive ? null : error} />

        {source.trim() === "" && !isFormatting && error == null && (
          <Shortcuts shortcuts={shortcuts} className={S.shortcuts} />
        )}

        <Flex className={S.toolbar} gap="sm" pt="sm" pr="sm" direction="column">
          <ButtonTooltip label={t`Function browser`}>
            <Button
              aria-label={t`Function browser`}
              onClick={toggleFunctionBrowser}
              variant={isFunctionBrowserOpen ? "filled" : "subtle"}
              className={S.toolbarButton}
              size="xs"
              p="x"
              leftSection={<Icon name="function" />}
            />
          </ButtonTooltip>
          {source.trim() !== "" && error == null && isValidated && (
            <ButtonTooltip label={t`Auto-format`}>
              <Button
                aria-label={t`Auto-format`}
                onClick={formatExpression}
                className={S.toolbarButton}
                variant="subtle"
                size="xs"
                p="xs"
                disabled={isFormatting || error != null}
                leftSection={<Icon name="format_code" />}
              />
            </ButtonTooltip>
          )}
        </Flex>

        {portal}
      </LayoutMain>

      {isFunctionBrowserOpen && (
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
  metadata,
  onChange,
  initialClause,
}: EditorProps & {
  metadata: Metadata;
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

  const handleUpdate = useCallback(
    (source: string, immediate: boolean = false) => {
      setSource(source);
      setIsValidated(false);

      if (source.trim() === "") {
        debouncedOnChange.cancel();
        handleChange(null, null);
        return;
      }

      const { error, expressionClause: clause } = diagnoseAndCompile({
        source,
        expressionMode,
        query,
        stageIndex,
        expressionIndex,
        metadata,
        availableColumns,
        availableMetrics,
      });
      if (immediate || errorRef.current) {
        debouncedOnChange.cancel();
        handleChange(clause, error);
      } else {
        debouncedOnChange(clause, error);
      }
    },
    [
      query,
      stageIndex,
      expressionMode,
      expressionIndex,
      metadata,
      handleChange,
      debouncedOnChange,
      availableColumns,
      availableMetrics,
    ],
  );

  useMount(() => {
    // format the source when the component mounts
    formatExpression({
      initial: clause === initialClause,
    });
  });

  const handleSourceChange = useCallback(
    (source: string) => {
      handleUpdate(source, false);
    },
    [handleUpdate],
  );

  const handleBlur = useCallback(() => {
    handleUpdate(source, true);
  }, [handleUpdate, source]);

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
