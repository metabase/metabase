import { completionStatus } from "@codemirror/autocomplete";
import { EditorState, Prec } from "@codemirror/state";
import { type EditorView, keymap } from "@codemirror/view";
import cx from "classnames";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLatest } from "react-use";
import { t } from "ttag";

import { CodeMirror } from "metabase/common/components/CodeMirror";
import { getTooltipPosition } from "metabase/querying/components/expressions/Editor";
import { Tooltip as ExpressionTooltip } from "metabase/querying/components/expressions/Editor/Tooltip";
import { useCustomTooltip } from "metabase/querying/components/expressions/Editor/custom-tooltip";
import { useExtensions } from "metabase/querying/components/expressions/Editor/extensions";
import { diagnoseAndCompile, format } from "metabase/querying/expressions";
import {
  ActionIcon,
  Box,
  Flex,
  Icon,
  Text,
  TextInput,
  Tooltip,
} from "metabase/ui";
import * as Lib from "metabase-lib";
import type { Database } from "metabase-types/api";

import S from "./SummarySidebar.module.css";
import { formulaTokens } from "./formula-tokens";
import type { SummaryBase, SummaryExpression } from "./types";
import { getDefaultFormulaName } from "./utils";

// formulas live on one line, like a spreadsheet's formula bar
const singleLine = /* #__PURE__ */ EditorState.transactionFilter.of(
  (transaction) => (transaction.newDoc.lines > 1 ? [] : transaction),
);

type SummaryFormulaEditorProps = {
  base: SummaryBase;
  database: Database | undefined;
  /** `aggregation` for Values, `expression` for the custom columns Rows and Columns group by. */
  expressionMode: "aggregation" | "expression";
  /** The formula being edited, if any; it's printed back into the editor once loaded. */
  initialClause?: Lib.Expressionable | null;
  /** What was typed after `=` in the well's search input, for a new formula. */
  initialSource?: string;
  initialName?: string;
  placeholder: string;
  submitLabel: string;
  onSubmit: (expression: SummaryExpression) => void;
  /** Esc, the close button, or `/` in an empty formula: go back to the well's search input. */
  onCancel: () => void;
};

/**
 * A well's inline, single-line formula editor, styled like the data sheet's formula bar. Enter adds
 * (or updates) the formula, named by the user or after the formula itself.
 */
export function SummaryFormulaEditor({
  base,
  database,
  expressionMode,
  initialClause,
  initialSource = "",
  initialName = "",
  placeholder,
  submitLabel,
  onSubmit,
  onCancel,
}: SummaryFormulaEditorProps) {
  const { query, stageIndex } = base;
  const [source, setSource] = useState(initialSource);
  const [name, setName] = useState(initialName);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const availableColumns = useMemo(
    () =>
      expressionMode === "aggregation"
        ? Lib.aggregableColumns(query, stageIndex)
        : Lib.expressionableColumns(query, stageIndex),
    [expressionMode, query, stageIndex],
  );
  const availableMetrics = useMemo(
    () =>
      expressionMode === "aggregation"
        ? Lib.availableMetrics(query, stageIndex)
        : undefined,
    [expressionMode, query, stageIndex],
  );

  // the edited formula is printed once, when the editor opens, so later renders don't reset what was typed
  const [editedClause] = useState(initialClause);
  const hasTypedRef = useRef(false);

  // the formatter loads lazily, so an edited formula shows up a moment after the editor,
  // unless the user has started typing in the meantime
  useEffect(() => {
    if (editedClause == null) {
      return;
    }
    let isCancelled = false;
    format(editedClause, {
      query,
      stageIndex,
      availableColumns,
      printWidth: Infinity,
    })
      .then((formula) => {
        if (!isCancelled && !hasTypedRef.current) {
          setSource(formula);
        }
      })
      .catch(() => {});
    return () => {
      isCancelled = true;
    };
  }, [editedClause, query, stageIndex, availableColumns]);

  const handleSubmit = () => {
    const formula = source.trim();
    if (formula.length === 0) {
      return;
    }
    const { error, expressionClause } = diagnoseAndCompile({
      source: formula,
      expressionMode,
      query,
      stageIndex,
      database,
      availableColumns,
      availableMetrics,
    });
    if (error || expressionClause == null) {
      setErrorMessage(error?.message ?? t`This formula isn't valid.`);
      return;
    }
    onSubmit({
      name: name.trim() || getDefaultFormulaName(formula),
      clause: expressionClause,
    });
  };

  const handlers = useLatest({ submit: handleSubmit, cancel: onCancel });

  const formulaKeymap = useMemo(() => {
    const isCompleting = (view: EditorView) =>
      completionStatus(view.state) === "active";
    return Prec.highest(
      keymap.of([
        {
          key: "Enter",
          run: (view) => {
            if (isCompleting(view)) {
              return false;
            }
            handlers.current.submit();
            return true;
          },
        },
        {
          key: "Escape",
          run: (view) => {
            if (isCompleting(view)) {
              return false;
            }
            handlers.current.cancel();
            return true;
          },
        },
        {
          // "/" in an empty formula goes back to search; anywhere else it's division
          key: "/",
          run: (view) => {
            if (view.state.doc.length > 0) {
              return false;
            }
            handlers.current.cancel();
            return true;
          },
        },
      ]),
    );
  }, [handlers]);

  const [completionTooltip, completionTooltipPortal] = useCustomTooltip({
    getPosition: getTooltipPosition,
    render: (props) => (
      <ExpressionTooltip
        query={query}
        stageIndex={stageIndex}
        database={database}
        expressionMode={expressionMode}
        {...props}
      />
    ),
  });

  const tokens = useMemo(() => formulaTokens(), []);
  const extensions = useExtensions({
    expressionMode,
    query,
    stageIndex,
    availableColumns,
    availableMetrics,
    database,
    extensions: [completionTooltip, formulaKeymap, singleLine, tokens],
  });

  const hasFormula = source.trim().length > 0;

  return (
    <Box data-testid="summary-formula-editor">
      <Box
        className={cx(S.formulaBox, { [S.formulaBoxInvalid]: errorMessage })}
      >
        <span className={S.formulaEquals}>{"="}</span>
        <CodeMirror
          className={S.formulaEditor}
          basicSetup={{
            lineNumbers: false,
            foldGutter: false,
            highlightActiveLine: false,
            highlightActiveLineGutter: false,
          }}
          extensions={extensions}
          value={source}
          placeholder={placeholder}
          autoCorrect="off"
          autoFocus
          onChange={(value) => {
            hasTypedRef.current = true;
            setSource(value);
            setErrorMessage(null);
          }}
        />
        {completionTooltipPortal}
        <Tooltip label={t`Cancel (Esc)`}>
          <ActionIcon
            variant="subtle"
            size="sm"
            aria-label={t`Cancel formula`}
            onClick={onCancel}
          >
            <Icon name="close" />
          </ActionIcon>
        </Tooltip>
      </Box>
      {hasFormula && (
        <Flex align="center" gap="xs" mt="xs">
          <TextInput
            size="xs"
            flex={1}
            value={name}
            placeholder={getDefaultFormulaName(source)}
            aria-label={t`Formula name`}
            leftSection={<Icon name="label" size={12} />}
            onChange={(event) => setName(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                handleSubmit();
              } else if (event.key === "Escape") {
                onCancel();
              }
            }}
          />
          <Tooltip label={t`${submitLabel} (Enter)`}>
            <ActionIcon
              variant="filled"
              color="summarize"
              aria-label={submitLabel}
              onClick={handleSubmit}
            >
              <Icon name="check" />
            </ActionIcon>
          </Tooltip>
        </Flex>
      )}
      {errorMessage && (
        <Text size="sm" c="error" mt="xs" data-testid="summary-formula-error">
          {errorMessage}
        </Text>
      )}
    </Box>
  );
}
