import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { useCallback, useMemo, useRef, useState } from "react";
import { t } from "ttag";

import { Box } from "metabase/ui";
import * as Lib from "metabase-lib";
import { diagnose } from "metabase-lib/v1/expressions/diagnostics";
import { format } from "metabase-lib/v1/expressions/format";
import { processSource } from "metabase-lib/v1/expressions/process";
import type { ErrorWithMessage } from "metabase-lib/v1/expressions/types";
import type { Expression } from "metabase-types/api";

import S from "./Editor.module.css";
import { useExtensions } from "./extensions";

type EditorProps = {
  expression: Expression | undefined | null;
  clause: Lib.ExpressionClause | undefined | null;
  error: ErrorWithMessage | null;
  name: string;
  query: Lib.Query;
  stageIndex: number;
  startRule?: "expression" | "aggregation" | "boolean";
  expressionIndex?: number;
  reportTimezone?: string;
  readOnly?: boolean;

  onChange: (
    expression: Expression | null,
    expressionClause: Lib.ExpressionClause | null,
  ) => void;
  onError: (error: ErrorWithMessage | null) => void;
};

export function Editor(props: EditorProps) {
  const {
    name,
    startRule = "expression",
    stageIndex,
    query,
    expressionIndex,
    readOnly,
    error,
  } = props;

  const ref = useRef<ReactCodeMirrorRef>(null);
  const { source, onSourceChange, commitExpression, hasChanges } =
    useExpression(props);

  const { extensions, content } = useExtensions({
    startRule,
    query,
    stageIndex,
    name,
    expressionIndex,
    onCommit: commitExpression,
  });

  const handleBlur = useCallback(() => {
    commitExpression(source);
  }, [source, commitExpression]);

  return (
    <>
      <div className={S.wrapper}>
        <div className={S.prefix}>=</div>
        <CodeMirror
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
      {content}
    </>
  );
}

function useExpression({
  name,
  expression: legacyExpression = null,
  clause,
  startRule = "expression",
  stageIndex,
  query,
  expressionIndex,
  onChange,
  onError,
}: EditorProps) {
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

  const commitExpression = useCallback(
    function (source: string) {
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
      });

      if (error) {
        onError(error);
        return null;
      }

      const compiledExpression = processSource({
        source,
        name,
        query,
        stageIndex,
        startRule,
        expressionIndex,
      });

      if (
        !compiledExpression?.expression ||
        !compiledExpression.expressionClause
      ) {
        onError({ message: t`Invalid expression` });
        return;
      }

      const { expression, expressionClause } = compiledExpression;
      onError(null);
      onChange(expression, expressionClause);
    },
    [name, query, stageIndex, startRule, expressionIndex, onChange, onError],
  );

  return {
    expression,
    commitExpression,
    source,
    onSourceChange: handleSourceChange,
    hasChanges,
  };
}
