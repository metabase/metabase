import { completionStatus } from "@codemirror/autocomplete";
import { EditorState, Prec } from "@codemirror/state";
import { type EditorView, keymap } from "@codemirror/view";
import cx from "classnames";
import {
  type MutableRefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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

import type {
  SummaryBase,
  SummaryExpression,
} from "../../../../components/view/SummarySidebar/types";
import { getDefaultFormulaName } from "../../../../components/view/SummarySidebar/utils";

import S from "./SummarySidebar.module.css";
import { formulaTokens } from "./formula-tokens";

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
  /** The name AI gave the formula, or the edited item's name; kept until the formula is changed. */
  initialName?: string;
  placeholder: string;
  submitLabel: string;
  onSubmit: (expression: SummaryExpression) => void;
  /** Esc, the close button, or `/` in an empty formula. */
  onCancel: () => void;
  /** The name the formula would get, or `null` while it's empty, as it's typed. */
  onNameChange?: (name: string | null) => void;
  /**
   * Set to a function that closes the editor without losing work: an empty or untouched formula
   * cancels, a valid one is submitted, and an invalid one stays open with its error. It returns
   * whether the editor closed.
   */
  dismissRef?: MutableRefObject<(() => boolean) | null>;
};

/**
 * A single-line formula editor, styled like the data sheet's formula bar. Enter adds (or updates)
 * the formula. Nobody types a name: an untouched formula keeps the one it came with (from AI, or
 * the edited item's), and a typed one is named after the formula itself.
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
  onNameChange,
  dismissRef,
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

  const hasFormula = source.trim().length > 0;
  const draftName = hasFormula ? formulaName : null;
  const onNameChangeRef = useLatest(onNameChange);
  useEffect(() => {
    onNameChangeRef.current?.(draftName);
  }, [draftName, onNameChangeRef]);

  const handleSubmit = () => {
    const formula = source.trim();
    if (formula.length === 0) {
      return false;
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
      return false;
    }
    onSubmit({ name: formulaName, clause: expressionClause });
    return true;
  };

  const handleDismiss = () => {
    const isUntouchedEdit = editedClause != null && !hasTyped;
    if (!hasFormula || isUntouchedEdit) {
      onCancel();
      return true;
    }
    return handleSubmit();
  };

  const handlers = useLatest({
    submit: handleSubmit,
    cancel: onCancel,
    dismiss: handleDismiss,
  });

  useEffect(() => {
    if (dismissRef == null) {
      return;
    }
    dismissRef.current = () => handlers.current.dismiss();
    return () => {
      dismissRef.current = null;
    };
  }, [dismissRef, handlers]);

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

  return (
    <Box className={S.formula} data-testid="summary-formula-editor">
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
          // focus as soon as the view exists, so keys typed right after `=` aren't lost on the way
          onCreateEditor={(view) => {
            viewRef.current = view;
            view.focus();
            moveCaretToEndIfPending(view);
          }}
          onChange={(value) => {
            hasTypedRef.current = true;
            setHasTyped(true);
            setSource(value);
            setErrorMessage(null);
          }}
        />
        {completionTooltipPortal}
      </Box>
      {errorMessage && (
        <Text
          className={S.formulaError}
          size="sm"
          mt="xs"
          data-testid="summary-formula-error"
        >
          {errorMessage}
        </Text>
      )}
      {/* like a spreadsheet's ✕ and ✓, side by side, under the formula they act on */}
      <Flex className={S.formulaFooter} align="center" gap="sm">
        <Text size="sm" c="text-secondary" flex={1} truncate>
          {hasFormula ? formulaName : t`Named after the formula when added`}
        </Text>
        <Tooltip label={t`Cancel (Esc)`}>
          <ActionIcon
            className={S.formulaAction}
            variant="subtle"
            radius="xxs"
            aria-label={t`Cancel formula`}
            onClick={onCancel}
          >
            <Icon name="close" />
          </ActionIcon>
        </Tooltip>
        <Tooltip label={t`${submitLabel} (Enter)`}>
          <ActionIcon
            className={cx(S.formulaAction, S.formulaSubmit)}
            variant="filled"
            radius="xxs"
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
