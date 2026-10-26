import { completionStatus } from "@codemirror/autocomplete";
import { EditorState, Prec } from "@codemirror/state";
import { type EditorView, keymap } from "@codemirror/view";
import cx from "classnames";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLatest } from "react-use";
import { t } from "ttag";

import { CodeMirror } from "metabase/common/components/CodeMirror";
import { getTooltipPosition } from "metabase/querying/components/expressions/Editor";
import { Tooltip as ExpressionTooltip } from "metabase/querying/components/expressions/Editor/Tooltip";
import { useCustomTooltip } from "metabase/querying/components/expressions/Editor/custom-tooltip";
import { useExtensions } from "metabase/querying/components/expressions/Editor/extensions";
import { diagnoseAndCompile, format } from "metabase/querying/expressions";
import { ActionIcon, Box, Flex, Icon, Text, Tooltip } from "metabase/ui";
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

// a module constant: CodeMirror reconfigures itself whenever it gets a new basicSetup object
const BASIC_SETUP = {
  lineNumbers: false,
  foldGutter: false,
  highlightActiveLine: false,
  highlightActiveLineGutter: false,
};

type SummaryFormulaEditorProps = {
  base: SummaryBase;
  database: Database | undefined;
  /** `aggregation` for Values, `expression` for the custom columns Rows and Columns group by. */
  expressionMode: "aggregation" | "expression";
  /** The formula being edited, if any; it's printed back into the editor once loaded. */
  initialClause?: Lib.Expressionable | null;
  /** What was typed after `=` in a well, or what AI drafted, for a new formula. */
  initialSource?: string;
  /** The name AI gave the formula, or the edited item's name; kept until the formula is changed. */
  initialName?: string;
  submitLabel: string;
  /** Called once the editor exists and has focus. */
  onEditorCreate?: (view: EditorView) => void;
  /** The name the formula would get if committed now; empty while there's no formula. */
  onNameChange?: (name: string) => void;
  onSubmit: (expression: SummaryExpression) => void;
  /** Esc, the cancel button, or `/` in an empty formula. */
  onCancel: () => void;
};

/**
 * The formula bar while a formula is open: fx, the single-line editor, any error, then cancel and
 * commit at the far right. Enter and ⌘/Ctrl+Enter commit. Nobody types a name: an untouched formula
 * keeps the one it came with (from AI, or the edited item's), and a typed one is named after the
 * formula itself.
 */
export function SummaryFormulaEditor({
  base,
  database,
  expressionMode,
  initialClause,
  initialSource = "",
  initialName = "",
  submitLabel,
  onEditorCreate,
  onNameChange,
  onSubmit,
  onCancel,
}: SummaryFormulaEditorProps) {
  const { query, stageIndex } = base;
  const [source, setSource] = useState(initialSource);
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
  const [hasTyped, setHasTyped] = useState(false);
  const viewRef = useRef<EditorView | null>(null);
  // set when the formatter prints the edited formula, so the caret lands at its end like a spreadsheet's
  const isCaretToEndPendingRef = useRef(false);
  const formulaName =
    (!hasTyped && initialName.trim()) || getDefaultFormulaName(source.trim());
  const hasFormula = source.trim().length > 0;
  const liveName = hasFormula ? formulaName : "";

  const onNameChangeRef = useLatest(onNameChange);
  useEffect(() => {
    onNameChangeRef.current?.(liveName);
  }, [liveName, onNameChangeRef]);

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
          isCaretToEndPendingRef.current = true;
          setSource(formula);
        }
      })
      .catch(() => {});
    return () => {
      isCancelled = true;
    };
  }, [editedClause, query, stageIndex, availableColumns]);

  // the printed formula and the editor's view each arrive asynchronously, in either order
  const moveCaretToEndIfPending = (view: EditorView | null) => {
    if (!isCaretToEndPendingRef.current || view == null) {
      return;
    }
    isCaretToEndPendingRef.current = false;
    view.dispatch({ selection: { anchor: view.state.doc.length } });
  };
  const moveCaretToEndIfPendingRef = useLatest(moveCaretToEndIfPending);

  useEffect(() => {
    moveCaretToEndIfPendingRef.current(viewRef.current);
  }, [source, moveCaretToEndIfPendingRef]);

  // stable, since CodeMirror reconfigures itself whenever its onChange changes, and the
  // completion tooltip rerenders this on every editor update
  const handleSourceChange = useCallback((value: string) => {
    hasTypedRef.current = true;
    setHasTyped(true);
    setSource(value);
    setErrorMessage(null);
  }, []);

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
    onSubmit({ name: formulaName, clause: expressionClause });
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
          // ⌘/Ctrl+Enter, the query builder's run shortcut, commits even over the suggestions
          key: "Mod-Enter",
          run: () => {
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
          // "/" in an empty formula cancels it; anywhere else it's division
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

  return (
    <Box
      className={cx(S.formulaBar, S.formulaBarActive, {
        [S.formulaBarInvalid]: errorMessage,
      })}
      data-testid="summary-formula-bar"
    >
      <Icon name="function" className={S.formulaBarFx} aria-hidden />
      <CodeMirror
        className={S.formulaEditor}
        basicSetup={BASIC_SETUP}
        extensions={extensions}
        value={source}
        placeholder={
          expressionMode === "aggregation"
            ? t`Sum([Total]) / Count()`
            : t`concat([Category], " – ", [Vendor])`
        }
        autoCorrect="off"
        autoFocus
        // focus as soon as the view exists, so keys typed right after `=` in a well aren't lost
        onCreateEditor={(view) => {
          viewRef.current = view;
          view.focus();
          onEditorCreate?.(view);
          moveCaretToEndIfPending(view);
        }}
        onChange={handleSourceChange}
      />
      {completionTooltipPortal}
      {errorMessage && (
        <Tooltip label={errorMessage} multiline maw={360}>
          <Flex
            className={S.formulaBarError}
            data-testid="summary-formula-error"
          >
            <Icon name="warning" size={14} aria-hidden />
            <Text className={S.formulaBarErrorText} truncate>
              {errorMessage}
            </Text>
          </Flex>
        </Tooltip>
      )}
      <Flex className={S.formulaBarActions}>
        <Tooltip label={t`Cancel (Esc)`}>
          <ActionIcon
            className={S.formulaBarAction}
            variant="subtle"
            aria-label={t`Cancel formula`}
            onClick={onCancel}
          >
            <Icon name="close" />
          </ActionIcon>
        </Tooltip>
        <Tooltip label={t`${submitLabel} (Enter)`}>
          <ActionIcon
            className={cx(S.formulaBarAction, S.formulaBarCommit)}
            variant="subtle"
            aria-label={submitLabel}
            disabled={!hasFormula}
            onClick={handleSubmit}
          >
            <Icon name="check" />
          </ActionIcon>
        </Tooltip>
      </Flex>
    </Box>
  );
}
