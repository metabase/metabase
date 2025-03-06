import type { EditorState } from "@codemirror/state";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import cx from "classnames";
import { useCallback, useMemo, useRef, useState } from "react";
import { useMount } from "react-use";
import { t } from "ttag";
import _ from "underscore";

import { useSelector } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";
import {
  Button,
  Tooltip as ButtonTooltip,
  Flex,
  Icon,
  usePreventClosePopover,
} from "metabase/ui";
import * as Lib from "metabase-lib";
import { format } from "metabase-lib/v1/expressions";
import { tokenAtPos } from "metabase-lib/v1/expressions/complete/util";
import { TOKEN } from "metabase-lib/v1/expressions/tokenizer";
import type { ErrorWithMessage } from "metabase-lib/v1/expressions/types";
import type Metadata from "metabase-lib/v1/metadata/Metadata";

import type { ClauseType, StartRule } from "../types";

import { CloseModal, useCloseModal } from "./CloseModal";
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
    onCloseEditor,
  } = props;

  const ref = useRef<ReactCodeMirrorRef>(null);
  const metadata = useSelector(getMetadata);

  const { source, onSourceChange, onBlur, formatExpression, isFormatting } =
    useExpression({
      ...props,
      metadata,
      error,
    });

  const shouldPreventClosingPopover = source !== "";

  usePreventClosePopover({
    onEscape: shouldPreventClosingPopover,
    onClickOutside: shouldPreventClosingPopover,
  });

  const { showModal, closeModal } = useCloseModal({
    enabled: shouldPreventClosingPopover,
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
        {source.trim() !== "" && error == null && (
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
      {showModal && (
        <CloseModal closeModal={closeModal} onClose={onCloseEditor} />
      )}
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
  const [isFormatting, setIsFormatting] = useState(true);

  const formatExpression = useCallback(() => {
    const expression =
      clause &&
      Lib.legacyExpressionForExpressionClause(query, stageIndex, clause);
    if (!expression) {
      setSource("");
      setIsFormatting(false);
      return;
    }

    format(expression, {
      query,
      stageIndex,
      expressionIndex,
      printWidth: 55, // 60 is the width of the editor
    })
      .then(source => {
        setIsFormatting(false);
        setSource(source);
      })
      .catch(() => {
        setSource("");
        setIsFormatting(false);
      });
  }, [clause, query, stageIndex, expressionIndex]);

  const debouncedOnChange = useMemo(
    () => _.debounce(onChange, DEBOUNCE_VALIDATION_MS, false),
    [onChange],
  );

  const handleUpdate = useCallback(
    (source: string, immediate: boolean = false) => {
      setSource(source);

      if (source.trim() === "") {
        debouncedOnChange.cancel();
        onChange(null, null);
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
        onChange(clause, error);
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
      onChange,
      debouncedOnChange,
      prevError,
    ],
  );

  useMount(() => {
    // format the source when the component mounts
    formatExpression();
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

  return {
    source,
    onSourceChange: handleSourceChange,
    onBlur: handleBlur,
    formatExpression,
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
