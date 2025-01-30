import type { EditorState } from "@codemirror/state";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { useCallback, useMemo, useRef, useState } from "react";
import { t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";
import { Box } from "metabase/ui";
import * as Lib from "metabase-lib";
import { isExpression } from "metabase-lib/v1/expressions";
import { diagnose } from "metabase-lib/v1/expressions/diagnostics";
import { format } from "metabase-lib/v1/expressions/format";
import { processSource } from "metabase-lib/v1/expressions/process";
import type { ErrorWithMessage } from "metabase-lib/v1/expressions/types";
import type { Expression } from "metabase-types/api";

import type { ClauseType, StartRule } from "../types";

import S from "./Editor.module.css";
import { Tooltip } from "./Tooltip";
import { useCustomTooltip } from "./custom-tooltip";
import { useExtensions } from "./extensions";
import type { Shortcut } from "./suggestions";
import { tokenAtPos } from "./util";

type EditorProps<S extends StartRule> = {
  id?: string;
  expression?: Expression | null;
  clause?: ClauseType<S> | null;
  error: ErrorWithMessage | null;
  name: string;
  query: Lib.Query;
  stageIndex: number;
  startRule: S;
  expressionIndex?: number;
  reportTimezone?: string;
  readOnly?: boolean;

  onChange: (
    expression: Expression | null,
    expressionClause: ClauseType<S> | null,
  ) => void;
  onCommit: (
    expression: Expression | null,
    expressionClause: ClauseType<S> | null,
  ) => void;
  onError: (error: ErrorWithMessage | null) => void;
  shortcuts?: Shortcut[];
};

export function Editor<S extends StartRule = "expression">(
  props: EditorProps<S>,
) {
  const {
    id,
    name,
    startRule = "expression",
    stageIndex,
    query,
    expressionIndex,
    readOnly,
    error,
    reportTimezone,
    shortcuts = [],
  } = props;

  const ref = useRef<ReactCodeMirrorRef>(null);
  const metadata = useSelector(getMetadata);

  const { source, onSourceChange, onChange, onCommit, hasChanges } =
    useExpression({ ...props, metadata });

  const [customTooltip, portal] = useCustomTooltip({
    getPosition: getTooltipPosition,
    render: props => (
      <Tooltip
        query={query}
        metadata={metadata}
        reportTimezone={reportTimezone}
        {...props}
      />
    ),
  });

  const extensions = useExtensions({
    startRule,
    query,
    stageIndex,
    name,
    expressionIndex,
    onCommit,
    reportTimezone,
    metadata,
    extensions: [customTooltip],
    shortcuts,
  });

  const handleBlur = useCallback(() => {
    onChange(source);
  }, [source, onChange]);

  return (
    <>
      <div className={S.wrapper}>
        <div className={S.prefix}>=</div>
        <CodeMirror
          id={id}
          ref={ref}
          data-testid="custom-expression-query-editor"
          className={S.editor}
          extensions={extensions}
          readOnly={readOnly}
          value={source}
          onChange={onSourceChange}
          onBlur={handleBlur}
          height="100%"
          width="100%"
          indentWithTab={false}
        />
      </div>
      {error && hasChanges && <Box className={S.error}>{error.message}</Box>}
      {portal}
    </>
  );
}

function useExpression<S extends StartRule = "expression">({
  name,
  expression: legacyExpression = null,
  clause,
  startRule,
  stageIndex,
  query,
  expressionIndex,
  metadata,
  onChange,
  onCommit,
  onError,
}: EditorProps<S> & {
  metadata: Metadata;
}) {
  const expression = useMemo(() => {
    const expressionFromClause =
      clause &&
      Lib.legacyExpressionForExpressionClause(query, stageIndex, clause);

    return expressionFromClause ?? legacyExpression;
  }, [legacyExpression, clause, query, stageIndex]);

  const formatExpression = useCallback(
    (expression: Expression | null) =>
      format(expression, {
        startRule,
        stageIndex,
        query,
        name,
        expressionIndex,
      }),
    [startRule, stageIndex, query, name, expressionIndex],
  );

  const [source, setSource] = useState(formatExpression(expression));
  const [hasChanges, setHasChanges] = useState(false);

  const handleSourceChange = useCallback((source: string) => {
    setSource(source);
    setHasChanges(true);
  }, []);

  const handleUpdate = useCallback(
    function (source: string, commit: boolean) {
      if (source.trim() === "") {
        onError({ message: t`Invalid expression` });
        return;
      }

      const error = diagnose({
        source,
        startRule,
        query,
        stageIndex,
        expressionIndex,
        metadata,
      });

      if (error) {
        onError(error);
        return;
      }

      const compiledExpression = processSource({
        source,
        name,
        query,
        stageIndex,
        startRule,
        expressionIndex,
      });

      const { expression, expressionClause, compileError } = compiledExpression;
      if (
        compileError &&
        typeof compileError === "object" &&
        "message" in compileError &&
        typeof compileError.message === "string"
      ) {
        onError({ message: compileError.message });
      } else if (compileError) {
        onError({ message: t`Invalid expression` });
      }

      if (!expression || !isExpression(expression) || !expressionClause) {
        onError({ message: t`Invalid expression` });
        return;
      }

      // TODO: can this be typed so we don't need to cast?
      const clause = expressionClause as ClauseType<S>;

      if (commit) {
        onCommit(expression, clause);
      } else {
        onChange(expression, clause);
      }
      onError(null);
      setHasChanges(false);
      setSource(formatExpression(expression));
    },
    [
      name,
      query,
      stageIndex,
      startRule,
      metadata,
      expressionIndex,
      formatExpression,
      onChange,
      onCommit,
      onError,
    ],
  );

  const handleChange = useCallback(
    (source: string) => handleUpdate(source, false),
    [handleUpdate],
  );
  const handleCommit = useCallback(
    (source: string) => handleUpdate(source, true),
    [handleUpdate],
  );

  return {
    expression,
    source,
    onSourceChange: handleSourceChange,
    onChange: handleChange,
    onCommit: handleCommit,
    hasChanges,
  };
}

function getTooltipPosition(state: EditorState) {
  const pos = state.selection.main.head;
  const source = state.doc.toString();
  const token = tokenAtPos(source, pos);

  return token?.start ?? pos;
}
