import { completionStatus } from "@codemirror/autocomplete";
import { EditorState, Prec } from "@codemirror/state";
import { type EditorView, keymap } from "@codemirror/view";
import cx from "classnames";
import { type ReactNode, type RefObject, useMemo, useState } from "react";
import { useLatest } from "react-use";
import { t } from "ttag";

import { skipToken, useGetDatabaseQuery } from "metabase/api";
import {
  CodeMirror,
  type CodeMirrorRef,
} from "metabase/common/components/CodeMirror";
import { useSuggestCustomColumnNameMutation } from "metabase/metabot/api";
import { getTooltipPosition } from "metabase/querying/components/expressions/Editor";
import { Tooltip as ExpressionTooltip } from "metabase/querying/components/expressions/Editor/Tooltip";
import { useCustomTooltip } from "metabase/querying/components/expressions/Editor/custom-tooltip";
import { useExtensions } from "metabase/querying/components/expressions/Editor/extensions";
import { diagnoseAndCompile } from "metabase/querying/expressions";
import { useSetting } from "metabase/settings";
import {
  ActionIcon,
  Box,
  Flex,
  Icon,
  Loader,
  Text,
  TextInput,
  Tooltip,
} from "metabase/ui";
import * as Lib from "metabase-lib";

import S from "./DataSheetBar.module.css";
import { formulaTokens } from "./formula-tokens";
import { getDefaultColumnName } from "./utils";

const EXPRESSION_MODE = "expression";
const NAME_SUGGESTION_TIMEOUT_MS = 6000;

// formulas live on one line, like a spreadsheet's formula bar
const singleLine = /* #__PURE__ */ EditorState.transactionFilter.of(
  (transaction) => (transaction.newDoc.lines > 1 ? [] : transaction),
);

type FormulaEditorProps = {
  query: Lib.Query;
  stageIndex: number;
  dataPath: string;
  tableName: string;
  editorRef: RefObject<CodeMirrorRef>;
  modeToggle: ReactNode;
  onAddColumn: (name: string, clause: Lib.ExpressionClause) => void;
  onStartSearch: () => void;
};

/**
 * An inline, single-line custom expression editor. Enter adds the formula as a new column, named
 * by the user, by the connected LLM when there is one, or after the formula itself.
 */
export function FormulaEditor({
  query,
  stageIndex,
  dataPath,
  tableName,
  editorRef,
  modeToggle,
  onAddColumn,
  onStartSearch,
}: FormulaEditorProps) {
  const [source, setSource] = useState("");
  const [columnName, setColumnName] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isNaming, setIsNaming] = useState(false);
  const canSuggestName = useCanSuggestColumnName();
  const [suggestColumnName] = useSuggestCustomColumnNameMutation();

  const databaseId = Lib.databaseID(query);
  const { data: database } = useGetDatabaseQuery(
    databaseId != null ? { id: databaseId } : skipToken,
  );
  const availableColumns = useMemo(
    () => Lib.expressionableColumns(query, stageIndex),
    [query, stageIndex],
  );

  const resetFormula = () => {
    setSource("");
    setColumnName("");
    setErrorMessage(null);
  };

  const resolveColumnName = async (formula: string) => {
    const defaultName = getDefaultColumnName(formula);
    if (columnName.trim().length > 0) {
      return columnName.trim();
    }
    if (!canSuggestName) {
      return defaultName;
    }
    setIsNaming(true);
    try {
      const suggestion = await Promise.race([
        suggestColumnName({ expression: formula, table_name: tableName })
          .unwrap()
          .then(({ name }) => name)
          .catch(() => null),
        new Promise<null>((resolve) =>
          setTimeout(() => resolve(null), NAME_SUGGESTION_TIMEOUT_MS),
        ),
      ]);
      return suggestion ?? defaultName;
    } finally {
      setIsNaming(false);
    }
  };

  const handleSubmit = async () => {
    const formula = source.trim();
    if (formula.length === 0 || isNaming) {
      return;
    }
    const { error, expressionClause } = diagnoseAndCompile({
      source: formula,
      expressionMode: EXPRESSION_MODE,
      query,
      stageIndex,
      database,
      availableColumns,
    });
    if (error || expressionClause == null) {
      setErrorMessage(error?.message ?? t`This formula isn't valid.`);
      return;
    }
    const name = await resolveColumnName(formula);
    onAddColumn(name, expressionClause);
    resetFormula();
  };

  const handleCancel = () => {
    resetFormula();
    editorRef.current?.view?.contentDOM.blur();
  };

  const handlers = useLatest({
    submit: handleSubmit,
    cancel: handleCancel,
    startSearch: onStartSearch,
  });

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
            void handlers.current.submit();
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
            handlers.current.startSearch();
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
        expressionMode={EXPRESSION_MODE}
        {...props}
      />
    ),
  });

  const tokens = useMemo(() => formulaTokens(), []);
  const extensions = useExtensions({
    expressionMode: EXPRESSION_MODE,
    query,
    stageIndex,
    availableColumns,
    database,
    extensions: [completionTooltip, formulaKeymap, singleLine, tokens],
  });

  const defaultName = getDefaultColumnName(source);
  const hasFormula = source.trim().length > 0;

  return (
    <Box>
      <Box
        className={cx(S.formulaBox, { [S.formulaBoxInvalid]: errorMessage })}
        data-testid="data-sheet-formula-bar"
      >
        <span className={S.formulaBadge}>{t`fx`}</span>
        <span className={S.formulaEquals}>{"="}</span>
        <CodeMirror
          ref={editorRef}
          className={S.formulaEditor}
          data-testid="data-sheet-formula-editor"
          basicSetup={{
            lineNumbers: false,
            foldGutter: false,
            highlightActiveLine: false,
            highlightActiveLineGutter: false,
          }}
          extensions={extensions}
          value={source}
          placeholder={t`Add a column to ${dataPath} with a formula, or type / to search`}
          autoCorrect="off"
          onChange={(value) => {
            setSource(value);
            setErrorMessage(null);
          }}
        />
        {completionTooltipPortal}
        {hasFormula && (
          <Flex align="center" gap="xs" className={S.formulaActions}>
            <TextInput
              size="xs"
              w={180}
              value={columnName}
              placeholder={
                canSuggestName ? t`Name (auto with AI)` : defaultName
              }
              aria-label={t`Column name`}
              leftSection={
                isNaming ? (
                  <Loader size="xs" />
                ) : canSuggestName ? (
                  <Icon name="sparkles" size={12} />
                ) : undefined
              }
              onChange={(event) => setColumnName(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void handleSubmit();
                }
              }}
            />
            <Tooltip label={t`Add column (Enter)`}>
              <ActionIcon
                variant="subtle"
                aria-label={t`Add column`}
                disabled={isNaming}
                onClick={() => void handleSubmit()}
              >
                <Icon name="check" />
              </ActionIcon>
            </Tooltip>
            <Tooltip label={t`Clear (Esc)`}>
              <ActionIcon
                variant="subtle"
                aria-label={t`Clear formula`}
                onClick={handleCancel}
              >
                <Icon name="close" />
              </ActionIcon>
            </Tooltip>
          </Flex>
        )}
        {modeToggle}
      </Box>
      {errorMessage && (
        <Text
          size="sm"
          c="error"
          mt="xs"
          data-testid="data-sheet-formula-error"
        >
          {errorMessage}
        </Text>
      )}
    </Box>
  );
}

function useCanSuggestColumnName() {
  const isMetabotEnabled = useSetting("metabot-enabled?");
  const isLlmConfigured = useSetting("llm-metabot-configured?");
  return Boolean(isMetabotEnabled && isLlmConfigured);
}
