import CodeMirror from "@uiw/react-codemirror";
import { useCallback, useEffect, useMemo, useState } from "react";
import { t } from "ttag";

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
    expression: legacyExpression = null,
    clause,
    startRule = "expression",
    stageIndex,
    query,
    expressionIndex,
    onChange,
    onError,
    readOnly,
  } = props;

  const expression = useMemo(() => {
    const expressionFromClause = clause
      ? Lib.legacyExpressionForExpressionClause(query, stageIndex, clause)
      : undefined;
    return expressionFromClause ?? legacyExpression;
  }, [legacyExpression, clause, query, stageIndex]);

  const [source, setSource] = useState(
    format(expression, {
      startRule,
      stageIndex,
      query,
      name,
      expressionIndex,
    }),
  );

  useEffect(() => {
    setSource(
      format(expression, {
        startRule,
        stageIndex,
        query,
        name,
        expressionIndex,
      }),
    );
  }, [expression, startRule, stageIndex, query, name, expressionIndex]);

  const commitExpression = useCallback(
    function () {
      if (source.trim() === "") {
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
      onChange(expression, expressionClause);
    },
    [
      source,
      name,
      query,
      stageIndex,
      startRule,
      expressionIndex,
      onChange,
      onError,
    ],
  );

  const extensions = useExtensions({
    startRule,
    query,
    stageIndex,
    name,
    expressionIndex,
    onCommit: commitExpression,
  });

  return (
    <div className={S.wrapper}>
      <div className={S.prefix}>=</div>
      <CodeMirror
        data-testid="custom-expression-query-editor"
        className={S.editor}
        extensions={extensions}
        readOnly={readOnly}
        value={source}
        onChange={setSource}
        onBlur={commitExpression}
        height="100%"
        width="100%"
        autoFocus
        data-autofocus
        indentWithTab={false}
      />
    </div>
  );
}
