import { startCompletion } from "@codemirror/autocomplete";
import { EditorSelection, Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import cx from "classnames";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLatest } from "react-use";
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
import { ActionIcon, Box, Button, Flex, Icon, Menu, Text } from "metabase/ui";
import * as Lib from "metabase-lib";

import S from "./FormulaBar.module.css";
import { FormulaBlockPicker } from "./FormulaBlockPicker";
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
} from "./formula-blocks";
import { type BlockClick, formulaPreview } from "./formula-preview";
import { compileFormula, tableFormulaColumns } from "./table-formula";

const STAGE_INDEX = -1;

type FormulaBarProps = {
  /** The query the formula aggregates over. */
  query: Lib.Query;
  /** The applied formula; empty for a draft. */
  source: string;
  autoFocus?: boolean;
  onCommit: (source: string) => void;
  onRemove?: () => void;
};

/**
 * Edits one summary value as a typed formula. Finished calls render as blocks
 * whose function and column can be swapped from a menu. Enter commits a valid
 * formula; Escape reverts it, or discards a draft through `onRemove`.
 */
export function FormulaBar({
  query,
  source: appliedSource,
  autoFocus = false,
  onCommit,
  onRemove,
}: FormulaBarProps) {
  const editorRef = useRef<CodeMirrorRef>(null);
  const [source, setSource] = useState(appliedSource);
  const [error, setError] = useState<string | null>(null);
  const [blockClick, setBlockClick] = useState<BlockClick | null>(null);
  const availableColumns = useMemo(() => tableFormulaColumns(query), [query]);
  const availableMetrics = useMemo(
    () => Lib.availableMetrics(query, STAGE_INDEX),
    [query],
  );
  const references = useMemo(() => getFormulaReferences(query), [query]);
  const databaseId = Lib.databaseID(query);
  const { data: database } = useGetDatabaseQuery(
    databaseId != null ? { id: databaseId } : skipToken,
  );
  const isDraft = appliedSource.length === 0;

  useEffect(() => {
    setSource(appliedSource);
    setError(null);
  }, [appliedSource]);

  const getDoc = () => editorRef.current?.view?.state.doc.toString() ?? source;

  const commit = (nextSource: string) => {
    const trimmedSource = nextSource.trim();
    setSource(trimmedSource);
    const result = compileFormula(query, trimmedSource);
    setError(result.error);
    if (result.error == null) {
      editorRef.current?.view?.contentDOM.blur();
      onCommit(trimmedSource);
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

  const handlers = useLatest({ commit, revert, getDoc, setBlockClick });

  const [helpTooltip, helpPortal] = useCustomTooltip({
    getPosition: getTooltipPosition,
    render: (props) => (
      <FormulaHelp
        query={query}
        stageIndex={STAGE_INDEX}
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
        "aria-label": t`Summary formula`,
      }),
    ],
    [handlers],
  );

  const extensions = useExtensions({
    expressionMode: "aggregation",
    query,
    stageIndex: STAGE_INDEX,
    availableColumns,
    availableMetrics,
    database,
    extensions: [helpTooltip, editorBehavior],
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
    <Box
      className={cx(S.bar, { [S.barError]: error })}
      data-testid="summary-formula-bar"
    >
      <Flex align="center" gap="xs" pl="sm" pr="xs" mih="2.5rem">
        <Text className={S.badge} aria-hidden>
          {t`fx`}
        </Text>
        <Box className={S.editor}>
          <CodeMirror
            ref={editorRef}
            basicSetup={false}
            value={source}
            extensions={extensions}
            placeholder={t`Sum([Price]), Count()…`}
            indentWithTab={false}
            autoCorrect="off"
            autoFocus={autoFocus}
            onChange={handleSourceChange}
          />
        </Box>
        <AddBlockMenu
          query={query}
          references={references}
          onAppend={handleAppend}
        />
        {isDirty && (
          <Button
            size="compact-sm"
            variant="filled"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => commit(getDoc())}
          >{t`Run`}</Button>
        )}
        {onRemove && (
          <ActionIcon
            size="sm"
            variant="subtle"
            c="text-secondary"
            aria-label={t`Remove calculation`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={onRemove}
          >
            <Icon name="close" size={12} aria-hidden />
          </ActionIcon>
        )}
      </Flex>
      {error && (
        <Text size="sm" c="error" role="alert" px="sm" pb="xs">
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

type AddBlockMenuProps = {
  query: Lib.Query;
  references: readonly FormulaReference[];
  onAppend: (operator: BlockOperator, insert: string | null) => void;
};

function AddBlockMenu({ query, references, onAppend }: AddBlockMenuProps) {
  return (
    <Menu position="bottom-end">
      <Menu.Target>
        <ActionIcon
          className={S.addButton}
          size="sm"
          variant="subtle"
          aria-label={t`Add to formula`}
          onMouseDown={(event) => event.preventDefault()}
        >
          <Icon name="add" size={12} aria-hidden />
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
