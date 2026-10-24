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

const PREVIEW_DELAY_MS = 300;

// a constant, since a new object each render reconfigures the editor, whose tooltip then rerenders it
const BASIC_SETUP = {
  lineNumbers: false,
  foldGutter: false,
  highlightActiveLine: false,
  highlightActiveLineGutter: false,
};

/** What a draft is compared by, so retyping the same formula doesn't rerun the question. */
function getPreviewKey(formula: string, name: string) {
  return `${name}\n${formula.replace(/\s+/g, " ").trim()}`;
}

type CompileResult =
  | { expression: SummaryExpression; error?: never }
  | { expression?: never; error: string };

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
  /** Whether the results already show this formula: the edited item, or a new formula's draft. */
  hasPreview: boolean;
  placeholder: string;
  submitLabel: string;
  /** A draft that compiles, a moment after typing stops; never the same draft twice in a row. */
  onPreview: (expression: SummaryExpression) => void;
  /** Enter or the check button, after the formula's final draft went to `onPreview`. */
  onSubmit: () => void;
  /** Esc, the close button, or `/` in an empty formula: go back to the well's search input. */
  onCancel: () => void;
};

/**
 * A well's inline, single-line formula editor, styled like the data sheet's formula bar. Every
 * draft that compiles goes to `onPreview` shortly after typing stops, so the results follow along;
 * Enter keeps the formula. Nobody types a name: an untouched formula keeps the one it came with
 * (from AI, or the edited item's), and a typed one is named after the formula itself.
 */
export function SummaryFormulaEditor({
  base,
  database,
  expressionMode,
  initialClause,
  initialSource = "",
  initialName = "",
  hasPreview,
  placeholder,
  submitLabel,
  onPreview,
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
  const formulaName =
    (!hasTyped && initialName.trim()) || getDefaultFormulaName(source.trim());
  // the draft the results show, so the same draft isn't applied twice
  const previewKeyRef = useRef<string | null>(null);

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
          // the results already show the edited formula as printed
          previewKeyRef.current = getPreviewKey(
            formula,
            initialName.trim() || getDefaultFormulaName(formula),
          );
        }
      })
      .catch(() => {});
    return () => {
      isCancelled = true;
    };
  }, [editedClause, initialName, query, stageIndex, availableColumns]);

  // `formula` is always the trimmed `source`, so it's named `formulaName`
  const compile = (formula: string): CompileResult => {
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
      return { error: error?.message ?? t`This formula isn't valid.` };
    }
    return { expression: { name: formulaName, clause: expressionClause } };
  };

  const applyPreview = (formula: string, expression: SummaryExpression) => {
    const previewKey = getPreviewKey(formula, expression.name);
    if (previewKey !== previewKeyRef.current) {
      previewKeyRef.current = previewKey;
      onPreview(expression);
    }
  };

  const handlePreview = () => {
    const formula = source.trim();
    if (formula.length === 0) {
      setErrorMessage(null);
      return;
    }
    const { error, expression } = compile(formula);
    if (expression == null) {
      setErrorMessage(error);
      return;
    }
    setErrorMessage(null);
    applyPreview(formula, expression);
  };

  const handleSubmit = () => {
    const formula = source.trim();
    if (formula.length === 0) {
      return;
    }
    const { error, expression } = compile(formula);
    if (expression == null) {
      setErrorMessage(error);
      return;
    }
    applyPreview(formula, expression);
    onSubmit();
  };

  const handlers = useLatest({
    preview: handlePreview,
    submit: handleSubmit,
    cancel: onCancel,
  });

  // previews a moment after typing stops; the edited formula, printed back untouched, already shows
  useEffect(() => {
    if (editedClause != null && !hasTypedRef.current) {
      return;
    }
    const timeoutId = setTimeout(
      () => handlers.current.preview(),
      PREVIEW_DELAY_MS,
    );
    return () => clearTimeout(timeoutId);
  }, [source, editedClause, handlers]);

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

  // stable, since a new callback each render reconfigures the editor, whose tooltip then rerenders it.
  // The error stays until the next check, so it doesn't flicker on every keystroke
  const handleChange = useCallback((value: string) => {
    hasTypedRef.current = true;
    setHasTyped(true);
    setSource(value);
  }, []);

  const hasFormula = source.trim().length > 0;

  return (
    <Box className={S.formula} data-testid="summary-formula-editor">
      <Box
        className={cx(S.formulaBox, { [S.formulaBoxInvalid]: errorMessage })}
      >
        <span className={S.formulaEquals}>{"="}</span>
        <CodeMirror
          className={S.formulaEditor}
          basicSetup={BASIC_SETUP}
          extensions={extensions}
          value={source}
          placeholder={placeholder}
          autoCorrect="off"
          autoFocus
          onChange={handleChange}
          // keys typed right after `=` would otherwise be lost while the editor mounts, or land
          // before what the search input already passed on
          onCreateEditor={(view) => {
            view.dispatch({ selection: { anchor: view.state.doc.length } });
            view.focus();
          }}
        />
        {completionTooltipPortal}
        <Tooltip label={t`Discard changes (Esc)`}>
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
          <Text size="sm" c="text-secondary" flex={1} truncate>
            {formulaName}
          </Text>
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
        <Text
          className={S.formulaError}
          size="sm"
          c="error"
          mt="xs"
          data-testid="summary-formula-error"
        >
          {errorMessage}
        </Text>
      )}
      <Flex
        className={S.formulaStatus}
        align="center"
        gap="xs"
        mt="xs"
        data-testid="summary-formula-status"
      >
        {errorMessage ? (
          <Text size="xs" c="text-secondary">
            {hasPreview
              ? t`Showing the last valid result`
              : t`Results update once the formula is valid`}
          </Text>
        ) : (
          <>
            <span className={S.formulaLiveDot} />
            <Text size="xs" c="text-secondary">
              {t`Live: results update as you type`}
            </Text>
          </>
        )}
      </Flex>
    </Box>
  );
}
