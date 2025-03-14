import type { EditorState } from "@codemirror/state";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import cx from "classnames";
import { useCallback, useMemo, useRef, useState } from "react";
import { useMount } from "react-use";
import { t } from "ttag";
import _ from "underscore";

import { useSelector } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";
import { Button, Tooltip as ButtonTooltip, Flex, Icon } from "metabase/ui";
import * as Lib from "metabase-lib";
import { format } from "metabase-lib/v1/expressions";
import { tokenAtPos } from "metabase-lib/v1/expressions/complete/util";
import { TOKEN } from "metabase-lib/v1/expressions/tokenizer";
import type { ErrorWithMessage } from "metabase-lib/v1/expressions/types";
import type Metadata from "metabase-lib/v1/metadata/Metadata";

import type { ClauseType, StartRule } from "../types";

import S from "./Editor.module.css";
import { Errors } from "./Errors";
import type { Shortcut } from "./Shortcuts";
import { Shortcuts } from "./Shortcuts";
import { Tooltip } from "./Tooltip";
import { DEBOUNCE_VALIDATION_MS } from "./constants";
import { useCustomTooltip } from "./custom-tooltip";
import { useExtensions } from "./extensions";
import { diagnoseAndCompileExpression } from "./utils";

type EditorProps<S extends StartRule> = {
  id?: string;
  clause?: ClauseType<S> | null;
  name: string;
  query: Lib.Query;
  stageIndex: number;
  startRule: S;
  expressionIndex?: number;
  reportTimezone?: string;
  readOnly?: boolean;
  error?: ErrorWithMessage | Error | null;
  onCloseEditor?: () => void;

  onChange: (
    clause: ClauseType<S> | null,
    error: ErrorWithMessage | null,
  ) => void;
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
    shortcuts,
  } = props;

  const ref = useRef<ReactCodeMirrorRef>(null);
  const metadata = useSelector(getMetadata);

  const {
    source,
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
    reportTimezone,
    metadata,
    extensions: [customTooltip],
  });

  return (
    <Flex
      className={cx(S.wrapper, { [S.formatting]: isFormatting })}
      direction="column"
    >
      <CodeMirror
        id={id}
        ref={ref}
        data-testid="custom-expression-query-editor"
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
      />
      <Errors error={error} />

      {source.trim() === "" && !isFormatting && error == null && (
        <Shortcuts shortcuts={shortcuts} className={S.shortcuts} />
      )}

      <Flex className={S.toolbar} pr="md" gap="sm">
        {source.trim() !== "" && error == null && isValidated && (
          <ButtonTooltip label={t`Auto-format`}>
            <Button
              aria-label={t`Auto-format`}
              onClick={formatExpression}
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
    </Flex>
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
  error: prevError,
}: EditorProps<S> & {
  metadata: Metadata;
}) {
  const [source, setSource] = useState("");
  const [initialSource, setInitialSource] = useState("");
  const [isFormatting, setIsFormatting] = useState(true);
  const [isValidated, setIsValidated] = useState(false);

  const formatExpression = useCallback(
    ({ initial = false }: { initial?: boolean }) => {
      const expression =
        clause &&
        Lib.legacyExpressionForExpressionClause(query, stageIndex, clause);

      if (!expression) {
        setIsFormatting(false);
        setSource("");
        if (initial) {
          setInitialSource("");
        }
        return;
      }

      format(expression, {
        query,
        stageIndex,
        expressionIndex,
        printWidth: 55, // 60 is the width of the editor
      })
        .catch(() => "")
        .then(source => {
          setIsFormatting(false);
          setSource(source);
          if (initial) {
            setInitialSource(source);
          }
        });
    },
    [clause, query, stageIndex, expressionIndex],
  );

  const handleChange = useCallback<typeof onChange>(
    (clause, error) => {
      setIsValidated(true);
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

      const { clause, error } = diagnoseAndCompileExpression(source, {
        startRule,
        query,
        stageIndex,
        expressionIndex,
        metadata,
        name,
      });
      if (immediate || prevError) {
        debouncedOnChange.cancel();
        handleChange(clause, error);
      } else {
        debouncedOnChange(clause, error);
      }
    },
    [
      name,
      query,
      stageIndex,
      startRule,
      metadata,
      expressionIndex,
      handleChange,
      debouncedOnChange,
      prevError,
    ],
  );

  useMount(() => {
    // format the source when the component mounts
    formatExpression({
      initial: true,
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
