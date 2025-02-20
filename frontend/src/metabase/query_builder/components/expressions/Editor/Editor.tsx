import type { EditorState } from "@codemirror/state";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import cx from "classnames";
import { useCallback, useMemo, useRef, useState } from "react";
import { useMount } from "react-use";
import { t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";
import { Box } from "metabase/ui";
import * as Lib from "metabase-lib";
import { format, isExpression } from "metabase-lib/v1/expressions";
import type { Shortcut } from "metabase-lib/v1/expressions/complete";
import { tokenAtPos } from "metabase-lib/v1/expressions/complete/util";
import { diagnose } from "metabase-lib/v1/expressions/diagnostics";
import { processSource } from "metabase-lib/v1/expressions/process";
import { TOKEN } from "metabase-lib/v1/expressions/tokenizer";
import type { ErrorWithMessage } from "metabase-lib/v1/expressions/types";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type { Expression } from "metabase-types/api";

import type { ClauseType, StartRule } from "../types";

import S from "./Editor.module.css";
import { Tooltip } from "./Tooltip";
import { useCustomTooltip } from "./custom-tooltip";
import { useExtensions } from "./extensions";

type EditorProps<S extends StartRule> = {
  id?: string;
  clause?: ClauseType<S> | null;
  error: ErrorWithMessage | null;
  name: string;
  query: Lib.Query;
  stageIndex: number;
  startRule: S;
  expressionIndex?: number;
  reportTimezone?: string;
  readOnly?: boolean;

  onChange: (clause: ClauseType<S> | null) => void;
  onCommit: (clause: ClauseType<S> | null) => void;
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
    reportTimezone,
  } = props;

  const ref = useRef<ReactCodeMirrorRef>(null);
  const metadata = useSelector(getMetadata);

  const { source, onSourceChange, onChange, onCommit, isFormatting } =
    useExpression({ ...props, metadata });

  const [customTooltip, portal] = useCustomTooltip({
    getPosition: getTooltipPosition,
    render: props => (
      <Tooltip
        query={query}
        stageIndex={stageIndex}
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
  });

  const handleBlur = useCallback(() => {
    onChange(source);
  }, [source, onChange]);

  return (
    <>
      <Box className={cx(S.wrapper, { [S.formatting]: isFormatting })}>
        <CodeMirror
          id={id}
          ref={ref}
          data-testid="custom-expression-query-editor"
          className={S.editor}
          extensions={extensions}
          readOnly={readOnly || isFormatting}
          value={source}
          onChange={onSourceChange}
          onBlur={handleBlur}
          height="100%"
          width="100%"
          indentWithTab={false}
        />
      </Box>
      {/* TODO: render elswhere */}
      {/* {error && hasChanges && <Box className={S.error}>{error.message}</Box>} */}
      {portal}
    </>
  );
}

function useExpression<S extends StartRule = "expression">({
  name,
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

    return expressionFromClause;
  }, [clause, query, stageIndex]);

  const [source, setSource] = useState<string>("");
  const [hasChanges, setHasChanges] = useState(false);
  const [isFormatting, setIsFormatting] = useState(true);

  const formatExpression = useCallback(
    async (expression: Expression | null): Promise<string> => {
      if (!expression) {
        return "";
      }

      return format(expression, {
        query,
        stageIndex,
        expressionIndex,
        printWidth: 55, // 60 is the width of the editor
      });
    },
    [stageIndex, query, expressionIndex],
  );

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
        return;
      } else if (compileError) {
        onError({ message: t`Invalid expression` });
        return;
      }

      if (!expression || !isExpression(expression) || !expressionClause) {
        onError({ message: t`Invalid expression` });
        return;
      }

      // TODO: can this be typed so we don't need to cast?
      const clause = expressionClause as ClauseType<S>;

      if (commit) {
        onCommit(clause);
      } else {
        onChange(clause);
      }
      onError(null);
      setIsFormatting(true);
      formatExpression(expression)
        .then(source => {
          setIsFormatting(false);
          setHasChanges(false);
          setSource(source);
        })
        .catch(err => {
          setIsFormatting(false);
          setHasChanges(false);
          onError(err);
        });
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

  useMount(() => {
    // format the expression on mount
    formatExpression(expression).then(source => {
      setSource(source);
      setIsFormatting(false);
    });
  });

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
    isFormatting,
  };
}

function getTooltipPosition(state: EditorState) {
  const pos = state.selection.main.head;
  const source = state.doc.toString();
  let token = tokenAtPos(source, pos);
  if (
    pos > 0 &&
    token &&
    token.type === TOKEN.Operator &&
    (token.op === "," || token.op === "(")
  ) {
    // when we're `,` or `(`, return the previous token instead
    token = tokenAtPos(source, pos - 1);
  }

  return token?.start ?? pos;
}
