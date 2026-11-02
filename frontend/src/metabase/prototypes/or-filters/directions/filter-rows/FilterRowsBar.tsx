import cx from "classnames";
import {
  type KeyboardEvent,
  type MouseEvent,
  type ReactElement,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { t } from "ttag";

import { FilterPill } from "metabase/querying/filters/components/FilterPanel/FilterPill";
import { FilterPicker } from "metabase/querying/filters/components/FilterPicker";
import { FilterPickerBody } from "metabase/querying/filters/components/FilterPicker/FilterPickerBody";
import { Box, Button, Group, Icon, Popover } from "metabase/ui";
import * as Lib from "metabase-lib";

import { getFilterLabel, toFilterClause } from "../../harness/clauses";
import type { Token } from "../expression-bar-2/tokens";
import {
  type ExpressionBarProps,
  forwardKey,
  useSearchSync,
} from "../expression-bar-drill/ExpressionBar";
import BarS from "../expression-bar-drill/ExpressionBar.module.css";
import {
  LogicColumnList,
  matchLogic,
} from "../expression-bar-drill/LogicColumnList";

import S from "./FilterRows.module.css";
import {
  type FilterRow,
  createRow,
  findParentRow,
  flattenRows,
  insertRowAfter,
  readRows,
  removeRow,
  updateRow,
  writeRows,
} from "./rows";

/** What every row needs from the editor; passed down the recursion. */
type Editor = {
  query: Lib.Query;
  stageIndex: number;
  activeRowId: string | undefined;
  setRows: (update: (rows: FilterRow[]) => FilterRow[]) => void;
  focusRow: (rowId: string, open?: boolean) => void;
  renderCaret: (row: FilterRow) => ReactElement;
};

/**
 * The filter panel as rows: each row is AND-ed inside its parentheses, rows
 * are OR-ed, and "(" starts a nested group of rows one indent in. Always
 * visible, driven from the keyboard.
 */
export function FilterRowsBar({
  query,
  stageIndex,
  onChange,
}: ExpressionBarProps) {
  const committedRows = useMemo(
    () => readRows(query, stageIndex),
    [query, stageIndex],
  );
  const [rows, setRowsState] = useState(committedRows);
  const [activeRowId, setActiveRowId] = useState<string>();
  const [text, setText] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [hasNavigated, setHasNavigated] = useState(false);
  const [draftColumn, setDraftColumn] = useState<Lib.ColumnMetadata>();
  const inputRefs = useRef(new Map<string, HTMLInputElement>());
  const pendingFocusRef = useRef<string | undefined>(undefined);
  const listRef = useRef<HTMLDivElement>(null);

  // External query changes (drills) reset the draft.
  useEffect(() => setRowsState(committedRows), [committedRows]);

  useLayoutEffect(() => {
    const rowId = pendingFocusRef.current;
    if (rowId) {
      pendingFocusRef.current = undefined;
      inputRefs.current.get(rowId)?.focus();
    }
  });

  const isDirty = rows !== committedRows;
  const flatRows = flattenRows(rows);
  const logicMatch = hasNavigated ? undefined : matchLogic(text);
  useSearchSync(listRef, text, isOpen && draftColumn == null, !logicMatch);

  const resetDraft = () => {
    setText("");
    setHasNavigated(false);
    setDraftColumn(undefined);
  };

  const close = () => {
    resetDraft();
    setIsOpen(false);
  };

  const focusRow = (rowId: string, open = false) => {
    resetDraft();
    setActiveRowId(rowId);
    setIsOpen(open);
    pendingFocusRef.current = rowId;
  };

  const setRows = (update: (rows: FilterRow[]) => FilterRow[]) =>
    setRowsState(update);

  const addOrRow = (rowId: string) => {
    const newRow = createRow();
    setRows((rows) => insertRowAfter(rows, rowId, newRow));
    focusRow(newRow.id);
  };

  const openGroup = (rowId: string) => {
    const newRow = createRow();
    setRows((rows) =>
      updateRow(rows, rowId, (row) => ({
        ...row,
        items: [...row.items, { type: "group", rows: [newRow] }],
      })),
    );
    focusRow(newRow.id);
  };

  const closeGroup = (rowId: string) => {
    const parent = findParentRow(rows, rowId);
    if (parent) {
      focusRow(parent.id);
    }
  };

  const handleToken = (rowId: string, token: Token) => {
    if (token.type === "op") {
      return token.op === "or" ? addOrRow(rowId) : resetDraft();
    }
    if (token.type === "paren") {
      return token.side === "open" ? openGroup(rowId) : closeGroup(rowId);
    }
  };

  const handlePickFilter = (rowId: string, filterable: Lib.Filterable) => {
    const clause = toFilterClause(query, stageIndex, filterable);
    setRows((rows) =>
      updateRow(rows, rowId, (row) => ({
        ...row,
        items: [...row.items, { type: "filter", clause }],
      })),
    );
    focusRow(rowId, true);
  };

  const handleBackspace = (row: FilterRow) => {
    const last = row.items.at(-1);
    if (last?.type === "filter") {
      setRows((rows) =>
        updateRow(rows, row.id, (row) => ({
          ...row,
          items: row.items.slice(0, -1),
        })),
      );
    } else if (last?.type === "group") {
      const lastNested = flattenRows(last.rows).at(-1);
      if (lastNested) {
        focusRow(lastNested.id);
      }
    } else if (flatRows.length > 1) {
      const index = flatRows.findIndex(({ id }) => id === row.id);
      const nextFocus = flatRows[index - 1] ?? flatRows[index + 1];
      setRows((rows) => removeRow(rows, row.id));
      focusRow(nextFocus.id);
    }
  };

  const moveRow = (row: FilterRow, offset: number) => {
    const index = flatRows.findIndex(({ id }) => id === row.id);
    const target = flatRows[index + offset];
    if (target) {
      focusRow(target.id);
    }
  };

  const apply = () => {
    if (isDirty) {
      onChange(writeRows(query, stageIndex, rows));
    }
    close();
    setActiveRowId(undefined);
  };

  const cancel = () => {
    setRowsState(committedRows);
    close();
    setActiveRowId(undefined);
  };

  const handleKeyDown = (
    event: KeyboardEvent<HTMLInputElement>,
    row: FilterRow,
  ) => {
    const isSearching = isOpen && (text.trim().length > 0 || hasNavigated);
    const isEmpty = text.length === 0;

    if (event.key === "(" || event.key === ")") {
      event.preventDefault();
      handleToken(row.id, {
        type: "paren",
        side: event.key === "(" ? "open" : "close",
      });
    } else if (event.key === " " && logicMatch) {
      event.preventDefault();
      handleToken(row.id, logicMatch.token);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (event.metaKey || event.ctrlKey) {
        apply();
      } else if (logicMatch) {
        handleToken(row.id, logicMatch.token);
      } else if (isSearching) {
        forwardKey(listRef, "Enter");
      } else {
        addOrRow(row.id);
      }
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (isSearching) {
        setHasNavigated(true);
        forwardKey(listRef, event.key);
      } else {
        moveRow(row, event.key === "ArrowDown" ? 1 : -1);
      }
    } else if (event.key === "Backspace" && isEmpty) {
      event.preventDefault();
      handleBackspace(row);
    } else if (event.key === "Escape") {
      event.preventDefault();
      if (isEmpty) {
        close();
      } else {
        resetDraft();
      }
    } else if (event.key === "Tab") {
      close();
    }
  };

  const renderCaret = (row: FilterRow) => {
    const isActive = row.id === activeRowId;
    const isDrafting = isActive && draftColumn != null;
    return (
      <Popover
        opened={isActive && isOpen}
        position="bottom-start"
        trapFocus={false}
        returnFocus={false}
        transitionProps={{ duration: 0 }}
        onChange={(opened) => !opened && close()}
      >
        <Popover.Target>
          {isDrafting ? (
            <span className={BarS.typingPill}>
              <span className={BarS.typingColumn}>
                {
                  Lib.displayInfo(query, stageIndex, draftColumn)
                    .longDisplayName
                }
              </span>
              <Icon
                name="close"
                size={12}
                className={BarS.typingClose}
                aria-label={t`Cancel`}
                onClick={() => focusRow(row.id)}
              />
            </span>
          ) : (
            <span className={BarS.typing}>
              <input
                ref={(input) => {
                  if (input) {
                    inputRefs.current.set(row.id, input);
                  } else {
                    inputRefs.current.delete(row.id);
                  }
                }}
                className={BarS.input}
                style={{ width: `calc(${isActive ? text.length : 0}ch + 2px)` }}
                value={isActive ? text : ""}
                aria-label={t`Filter row`}
                onChange={(event) => {
                  setText(event.target.value);
                  setHasNavigated(false);
                  setIsOpen(true);
                }}
                onFocus={() => {
                  if (!isActive) {
                    resetDraft();
                    setActiveRowId(row.id);
                  }
                }}
                onKeyDown={(event) => handleKeyDown(event, row)}
              />
            </span>
          )}
        </Popover.Target>
        <Popover.Dropdown data-testid="filter-picker-dropdown">
          {isDrafting ? (
            <FilterPickerBody
              query={query}
              stageIndex={stageIndex}
              column={draftColumn}
              isNew
              onChange={(filter) => handlePickFilter(row.id, filter)}
              onBack={() => focusRow(row.id, true)}
            />
          ) : (
            <LogicColumnList
              listRef={listRef}
              query={query}
              stageIndex={stageIndex}
              onFocusSteal={() => inputRefs.current.get(row.id)?.focus()}
              text={text}
              isLogicHighlightable={logicMatch != null}
              onPickToken={(token) => handleToken(row.id, token)}
              onPickColumn={(column) => {
                setText("");
                setDraftColumn(column);
              }}
            />
          )}
        </Popover.Dropdown>
      </Popover>
    );
  };

  const editor: Editor = {
    query,
    stageIndex,
    activeRowId,
    setRows,
    focusRow,
    renderCaret,
  };

  return (
    <Box className={S.editor} data-testid="qb-filters-panel">
      <Box flex={1} miw={0}>
        <RowGroup rows={rows} editor={editor} />
      </Box>
      <Group gap="sm" wrap="nowrap" pb="xs">
        <span className={S.hint}>
          {t`Enter: new OR row · ( nested group · ⌘Enter: apply`}
        </span>
        {isDirty && (
          <>
            <Button size="compact-sm" variant="subtle" onClick={cancel}>
              {t`Cancel`}
            </Button>
            <Button size="compact-sm" variant="filled" onClick={apply}>
              {t`Apply`}
            </Button>
          </>
        )}
      </Group>
    </Box>
  );
}

function RowGroup({ rows, editor }: { rows: FilterRow[]; editor: Editor }) {
  return (
    <div className={S.group}>
      {rows.map((row, index) => (
        <div key={row.id}>
          {index > 0 && (
            <span className={cx(S.connector, S.connectorOr)}>{t`or`}</span>
          )}
          <RowView row={row} editor={editor} />
        </div>
      ))}
    </div>
  );
}

function RowView({ row, editor }: { row: FilterRow; editor: Editor }) {
  const { query, stageIndex, activeRowId, setRows, focusRow } = editor;
  const isActive = row.id === activeRowId;

  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      focusRow(row.id, true);
    }
  };

  const updateItems = (
    update: (items: FilterRow["items"]) => FilterRow["items"],
  ) =>
    setRows((rows) =>
      updateRow(rows, row.id, (row) => ({ ...row, items: update(row.items) })),
    );

  return (
    <div
      className={cx(S.row, { [S.rowActive]: isActive })}
      onClick={handleClick}
    >
      <span className={S.paren}>(</span>
      {row.items.map((item, index) => (
        <ItemSlot key={index} hasConnector={index > 0}>
          {item.type === "filter" ? (
            <PillView
              query={query}
              stageIndex={stageIndex}
              clause={item.clause}
              onReplace={(clause) =>
                updateItems((items) =>
                  items.map((other, otherIndex) =>
                    otherIndex === index ? { type: "filter", clause } : other,
                  ),
                )
              }
              onRemove={() => {
                updateItems((items) =>
                  items.filter((_, otherIndex) => otherIndex !== index),
                );
                focusRow(row.id);
              }}
            />
          ) : (
            <div className={S.nested}>
              <RowGroup rows={item.rows} editor={editor} />
            </div>
          )}
        </ItemSlot>
      ))}
      {isActive && row.items.length > 0 && (
        <span className={cx(S.connector, S.connectorPending)}>{t`and`}</span>
      )}
      {editor.renderCaret(row)}
      {row.items.length === 0 && !isActive && (
        <span className={S.placeholder}>{t`Type to filter…`}</span>
      )}
      <span className={S.paren}>)</span>
    </div>
  );
}

function ItemSlot({
  hasConnector,
  children,
}: {
  hasConnector: boolean;
  children: ReactElement;
}) {
  return (
    <>
      {hasConnector && <span className={S.connector}>{t`and`}</span>}
      {children}
    </>
  );
}

type PillViewProps = {
  query: Lib.Query;
  stageIndex: number;
  clause: Lib.FilterClause;
  onReplace: (clause: Lib.FilterClause) => void;
  onRemove: () => void;
};

/** A focusable pill: Tab reaches it, Enter edits it, Backspace removes it. */
function PillView({
  query,
  stageIndex,
  clause,
  onReplace,
  onRemove,
}: PillViewProps) {
  const [isOpened, setIsOpened] = useState(false);

  const handleKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (event.target !== event.currentTarget) {
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      setIsOpened(true);
    } else if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      onRemove();
    }
  };

  return (
    <Popover
      opened={isOpened}
      position="bottom-start"
      transitionProps={{ duration: 0 }}
      onChange={setIsOpened}
    >
      <Popover.Target>
        <span className={S.pill} tabIndex={0} onKeyDown={handleKeyDown}>
          <FilterPill
            onClick={() => setIsOpened((opened) => !opened)}
            onRemoveClick={onRemove}
          >
            {getFilterLabel(query, stageIndex, clause)}
          </FilterPill>
        </span>
      </Popover.Target>
      <Popover.Dropdown data-testid="filter-picker-dropdown">
        <FilterPicker
          query={query}
          stageIndex={stageIndex}
          filter={clause}
          onSelect={(filterable) => {
            onReplace(toFilterClause(query, stageIndex, filterable));
            setIsOpened(false);
          }}
          onClose={() => setIsOpened(false)}
        />
      </Popover.Dropdown>
    </Popover>
  );
}
