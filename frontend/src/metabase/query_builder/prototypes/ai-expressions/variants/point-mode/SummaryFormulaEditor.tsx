import { completionStatus } from "@codemirror/autocomplete";
import { EditorState, Prec } from "@codemirror/state";
import { type EditorView, keymap } from "@codemirror/view";
import cx from "classnames";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLatest } from "react-use";
import { t } from "ttag";

import {
  CodeMirror,
  type CodeMirrorRef,
} from "metabase/common/components/CodeMirror";
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
import {
  type ActiveFormulaEditor,
  useRegisterActiveFormulaEditor,
} from "./point-mode";

/** The reference a field click put at the cursor, which the next click replaces, like Sheets. */
type PointedReference = { from: number; to: number };

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
  className?: string;
  onSubmit: (expression: SummaryExpression) => void;
  /** Esc, the close button, or `/` in an empty formula: go back to the well's search input. */
  onCancel: () => void;
};

/**
 * A well's inline, single-line formula editor, styled like the data sheet's formula bar. Enter adds
 * (or updates) the formula. Nobody types a name: an untouched formula keeps the one it came with
 * (from AI, or the edited item's), and a typed one is named after the formula itself.
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
  className,
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
  const isPrintingRef = useRef(false);
  const [hasTyped, setHasTyped] = useState(false);
  const formulaName =
    (!hasTyped && initialName.trim()) || getDefaultFormulaName(source.trim());

  const editorRef = useRef<CodeMirrorRef>(null);
  const pointedReferenceRef = useRef<PointedReference | null>(null);
  const isPointingRef = useRef(false);
  const [referenceColorClassNames, setReferenceColorClassNames] = useState<
    ReadonlyMap<string, string>
  >(() => new Map());

  const insert = useCallback((text: string) => {
    const view = editorRef.current?.view;
    if (view == null) {
      return;
    }
    const { selection } = view.state;
    const pointed = pointedReferenceRef.current;
    // clicking field after field swaps the one just pointed at, until something else is typed
    const range =
      pointed != null &&
      selection.main.empty &&
      selection.main.head === pointed.to
        ? pointed
        : { from: selection.main.from, to: selection.main.to };
    isPointingRef.current = true;
    view.dispatch({
      changes: { ...range, insert: text },
      selection: { anchor: range.from + text.length },
      scrollIntoView: true,
      userEvent: "input.point",
    });
    isPointingRef.current = false;
    pointedReferenceRef.current = {
      from: range.from,
      to: range.from + text.length,
    };
    view.focus();
  }, []);

  const activeEditor = useMemo<ActiveFormulaEditor>(
    () => ({ expressionMode, referenceColorClassNames, insert }),
    [expressionMode, referenceColorClassNames, insert],
  );
  useRegisterActiveFormulaEditor(activeEditor);

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
          isPrintingRef.current = true;
          setSource(formula);
        }
      })
      .catch(() => {});
    return () => {
      isCancelled = true;
    };
  }, [editedClause, query, stageIndex, availableColumns]);

  // the printed formula ends with the cursor, ready for the next reference to be pointed at.
  // the print can land before the view is created, so this also runs once it is
  const placeCursorAfterPrint = useCallback((view: EditorView | undefined) => {
    if (isPrintingRef.current && view != null) {
      isPrintingRef.current = false;
      view.dispatch({ selection: { anchor: view.state.doc.length } });
    }
  }, []);
  useEffect(() => {
    placeCursorAfterPrint(editorRef.current?.view);
  }, [source, placeCursorAfterPrint]);

  // CodeMirror creates its view a render after mounting, so characters typed right after the
  // `=` that opened the editor would land nowhere. Hold them until the view exists
  const pendingTextRef = useRef("");
  const isViewCreatedRef = useRef(false);
  useLayoutEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isCharacter =
        event.key.length === 1 &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey;
      if (!isViewCreatedRef.current && isCharacter) {
        event.preventDefault();
        pendingTextRef.current += event.key;
      }
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, []);

  const handleCreateEditor = (view: EditorView) => {
    isViewCreatedRef.current = true;
    view.focus();
    placeCursorAfterPrint(view);
    const pendingText = pendingTextRef.current;
    pendingTextRef.current = "";
    if (pendingText.length > 0) {
      const end = view.state.doc.length;
      view.dispatch({
        changes: { from: end, insert: pendingText },
        selection: { anchor: end + pendingText.length },
        userEvent: "input.type",
      });
    }
  };

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

  const tokens = useMemo(
    () =>
      formulaTokens((nextColorClassNames) =>
        setReferenceColorClassNames((colorClassNames) =>
          colorClassNames.size === nextColorClassNames.size &&
          [...nextColorClassNames].every(
            ([key, colorClassName]) =>
              colorClassNames.get(key) === colorClassName,
          )
            ? colorClassNames
            : nextColorClassNames,
        ),
      ),
    [],
  );
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
    <Box
      className={cx(S.formula, className)}
      data-testid="summary-formula-editor"
    >
      <Box
        className={cx(S.formulaBox, { [S.formulaBoxInvalid]: errorMessage })}
      >
        <span className={S.formulaEquals}>{"="}</span>
        <CodeMirror
          ref={editorRef}
          className={S.formulaEditor}
          // focus as soon as the view exists, and type in what was held while it didn't
          onCreateEditor={handleCreateEditor}
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
            if (!isPointingRef.current) {
              pointedReferenceRef.current = null;
            }
            hasTypedRef.current = true;
            setHasTyped(true);
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
    </Box>
  );
}
