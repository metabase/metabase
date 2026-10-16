import { startCompletion } from "@codemirror/autocomplete";
import { EditorSelection, Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import cx from "classnames";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { t } from "ttag";

import { skipToken, useGetDatabaseQuery } from "metabase/api";
import {
  CodeMirror,
  type CodeMirrorRef,
} from "metabase/common/components/CodeMirror";
import { getTooltipPosition } from "metabase/querying/components/expressions/Editor/Editor";
import { Tooltip as FormulaHelp } from "metabase/querying/components/expressions/Editor/Tooltip";
import { useCustomTooltip } from "metabase/querying/components/expressions/Editor/custom-tooltip";
import { useExtensions } from "metabase/querying/components/expressions/Editor/extensions";
import { format } from "metabase/querying/expressions";
import { ActionIcon, Box, Button, Flex, Icon, Menu, Text } from "metabase/ui";
import * as Lib from "metabase-lib";

import {
  BLOCK_FUNCTIONS,
  BLOCK_OPERATORS,
  type BlockOperator,
  type FormulaEdit,
  type FormulaReference,
  applyFormulaEdit,
  getCallSource,
  getColumnEdit,
  getFormulaReferences,
  getFunctionDisplayName,
  getFunctionEdit,
} from "../../utils/formula-blocks";
import {
  applyTableFormula,
  applyTableFormulaList,
  tableFormulaColumns,
} from "../../utils/table-formula";

import S from "./DatasetExplorer.module.css";
import { FormulaBlockPicker } from "./FormulaBlockPicker";
import E from "./FormulaEditor.module.css";
import { type BlockClick, formulaPreview } from "./formula-preview";

/**
 * Edits calculations as typed formulas. Finished calls render as blocks whose
 * function and column can be swapped from a menu.
 *
 * The `row` variant edits the aggregation at `aggregationIndex`; when it
 * doesn't exist yet, committing adds it and Escape calls `onRemove` to discard
 * the draft. The `single` variant edits every aggregation at once as a
 * comma-separated list, like the metric explorer's bar.
 */
export function TableFormulaBar({
  query,
  onChange,
  onRemove,
  variant = "row",
  aggregationIndex = 0,
  autoFocus = false,
}: {
  query: Lib.Query;
  variant?: "row" | "single";
  aggregationIndex?: number;
  autoFocus?: boolean;
  onChange: (query: Lib.Query) => void;
  onRemove?: () => void;
}) {
  const isSingle = variant === "single";
  const editorRef = useRef<CodeMirrorRef>(null);
  const [source, setSource] = useState("");
  const [appliedSource, setAppliedSource] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [blockClick, setBlockClick] = useState<BlockClick | null>(null);
  const availableColumns = useMemo(() => tableFormulaColumns(query), [query]);
  const availableMetrics = useMemo(
    () => Lib.availableMetrics(query, -1),
    [query],
  );
  const references = useMemo(() => getFormulaReferences(query), [query]);
  const databaseId = Lib.databaseID(query);
  const { data: database } = useGetDatabaseQuery(
    databaseId != null ? { id: databaseId } : skipToken,
  );

  useEffect(() => {
    let active = true;
    const aggregations = Lib.aggregations(query, -1);
    const formatted = isSingle
      ? Promise.all(
          aggregations.map((aggregation) =>
            format(aggregation, { query, stageIndex: -1 }),
          ),
        ).then((values) => values.join(", "))
      : aggregations[aggregationIndex]
        ? format(aggregations[aggregationIndex], { query, stageIndex: -1 })
        : null;
    if (formatted) {
      void formatted
        .then((value) => {
          if (active) {
            setSource(value);
            setAppliedSource(value);
            setError(null);
          }
        })
        .catch(() => {
          if (active) {
            setError(
              t`This formula could not be displayed. Enter a new formula to replace it.`,
            );
          }
        });
    }
    return () => {
      active = false;
    };
  }, [query, aggregationIndex, isSingle]);

  const getDoc = () => editorRef.current?.view?.state.doc.toString() ?? source;

  const commit = (nextSource: string) => {
    const result = isSingle
      ? applyTableFormulaList(query, nextSource)
      : applyTableFormula(query, nextSource, aggregationIndex);
    setSource(nextSource);
    setError(result.error);
    if (result.query) {
      onChange(result.query);
      editorRef.current?.view?.contentDOM.blur();
    }
  };

  const applyEdit = (edit: FormulaEdit | null) => {
    if (edit) {
      commit(applyFormulaEdit(getDoc(), edit));
    }
  };

  const revert = () => {
    setSource(appliedSource);
    setError(null);
    editorRef.current?.view?.contentDOM.blur();
    const isDraft = !isSingle && !Lib.aggregations(query, -1)[aggregationIndex];
    if (isDraft) {
      onRemove?.();
    }
  };

  const focusAt = (pos: number) => {
    const view = editorRef.current?.view;
    if (view) {
      view.focus();
      view.dispatch({ selection: EditorSelection.cursor(pos) });
      startCompletion(view);
    }
  };

  const handlers = useRef({ commit, revert, getDoc, setBlockClick });
  handlers.current = { commit, revert, getDoc, setBlockClick };

  const [helpTooltip, helpPortal] = useCustomTooltip({
    getPosition: getTooltipPosition,
    render: (props) => (
      <FormulaHelp
        query={query}
        stageIndex={-1}
        database={database}
        expressionMode="aggregation"
        {...props}
      />
    ),
  });

  const editorBehavior = useMemo(
    () => [
      formulaPreview((click) => handlers.current.setBlockClick(click)),
      Prec.high(
        keymap.of([
          {
            key: "Enter",
            run: () => {
              handlers.current.commit(handlers.current.getDoc());
              return true;
            },
          },
          {
            key: "Escape",
            run: () => {
              handlers.current.revert();
              return true;
            },
          },
        ]),
      ),
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({
        "aria-label": t`Summarization formula`,
      }),
    ],
    [],
  );

  const extensions = useExtensions({
    expressionMode: "aggregation",
    query,
    stageIndex: -1,
    availableColumns,
    availableMetrics,
    database,
    extensions: [helpTooltip, editorBehavior],
    // A comma-separated list isn't one valid expression; commit reports errors.
    lint: !isSingle,
  });

  const isDirty = source.trim() !== appliedSource.trim();

  // CodeMirror reconfigures the editor whenever `onChange` changes, and the
  // help tooltip sets state on every editor update, so this must stay stable.
  const handleSourceChange = useCallback((value: string) => {
    setSource(value);
    setError(null);
  }, []);

  const handleAppend = (operator: BlockOperator, insert: string | null) => {
    const doc = getDoc().trimEnd();
    const prefix = doc ? `${doc} ${operator} ` : "";
    if (insert) {
      commit(`${prefix}${insert}`);
      return;
    }
    setSource(prefix);
    requestAnimationFrame(() => focusAt(prefix.length));
  };

  return (
    <Box className={cx(S.formula, { [S.formulaError]: error })}>
      <Flex align="center" gap="sm" px="md" mih="3rem">
        <Icon name="sum" c="core-brand" aria-hidden />
        <Box className={E.editor}>
          <CodeMirror
            ref={editorRef}
            basicSetup={false}
            value={source}
            extensions={extensions}
            placeholder={
              isSingle
                ? t`Add calculations separated by commas, like Sum([Price]), Count()`
                : t`Type a formula like Sum([Price]), or use + to add a block`
            }
            indentWithTab={false}
            autoCorrect="off"
            autoFocus={autoFocus}
            data-testid="table-formula-editor"
            onChange={handleSourceChange}
          />
        </Box>
        {!isSingle && (
          <AddBlockMenu
            query={query}
            references={references}
            onAppend={handleAppend}
          />
        )}
        {isDirty && (
          <Button
            size="compact-sm"
            variant="filled"
            rightSection={<Icon name="enter_or_return" size={12} aria-hidden />}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => commit(getDoc())}
          >{t`Run`}</Button>
        )}
        {onRemove && (
          <ActionIcon
            variant="subtle"
            c="text-secondary"
            aria-label={t`Remove calculation`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={onRemove}
          >
            <Icon name="close" aria-hidden />
          </ActionIcon>
        )}
      </Flex>
      {error && (
        <Text size="sm" c="error" role="alert" pr="md" pb="sm" pl="2.75rem">
          {error}
        </Text>
      )}
      {helpPortal}
      {blockClick && (
        <FormulaBlockPicker
          query={query}
          click={blockClick}
          onClose={() => setBlockClick(null)}
          onSelectFunction={(fn) =>
            applyEdit(getFunctionEdit(query, blockClick.call, fn))
          }
          onSelectColumn={(column) =>
            applyEdit(
              getColumnEdit(
                query,
                blockClick.call,
                blockClick.columnIndex,
                column,
              ),
            )
          }
          onEditAsText={() => {
            setBlockClick(null);
            requestAnimationFrame(() => focusAt(blockClick.call.name.to));
          }}
        />
      )}
    </Box>
  );
}

function AddBlockMenu({
  query,
  references,
  onAppend,
}: {
  query: Lib.Query;
  references: readonly FormulaReference[];
  onAppend: (operator: BlockOperator, insert: string | null) => void;
}) {
  return (
    <Menu position="bottom-end">
      <Menu.Target>
        <ActionIcon
          className={E.addButton}
          variant="subtle"
          aria-label={t`Add to formula`}
          onMouseDown={(event) => event.preventDefault()}
        >
          <Icon name="add" aria-hidden />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        {BLOCK_OPERATORS.map(({ operator, symbol }) => (
          <Menu.Sub key={operator} position="right-start">
            <Menu.Sub.Target>
              <Menu.Sub.Item
                leftSection={
                  <Text fw={700} c="text-syntax-parameter" w="1rem" ta="center">
                    {symbol}
                  </Text>
                }
              >
                {getOperatorLabel(operator)}
              </Menu.Sub.Item>
            </Menu.Sub.Target>
            <Menu.Sub.Dropdown>
              {BLOCK_FUNCTIONS.map((fn) => (
                <Menu.Item
                  key={fn}
                  onClick={() => onAppend(operator, getCallSource(query, fn))}
                >
                  {getFunctionDisplayName(fn)}
                </Menu.Item>
              ))}
              {references.length > 0 && (
                <>
                  <Menu.Divider />
                  <Menu.Label>{t`Metrics`}</Menu.Label>
                  {references.map((reference) => (
                    <Menu.Item
                      key={reference.source}
                      leftSection={<Icon name="metric" aria-hidden />}
                      onClick={() => onAppend(operator, reference.source)}
                    >
                      {reference.name}
                    </Menu.Item>
                  ))}
                </>
              )}
              <Menu.Divider />
              <Menu.Item
                leftSection={<Icon name="pencil" aria-hidden />}
                onClick={() => onAppend(operator, null)}
              >
                {t`Type a number or formula`}
              </Menu.Item>
            </Menu.Sub.Dropdown>
          </Menu.Sub>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}

function getOperatorLabel(operator: BlockOperator) {
  switch (operator) {
    case "+":
      return t`Add`;
    case "-":
      return t`Subtract`;
    case "*":
      return t`Multiply by`;
    case "/":
      return t`Divide by`;
  }
}
