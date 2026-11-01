import {
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type RefObject,
  useMemo,
  useRef,
  useState,
} from "react";
import { t } from "ttag";

import { AggregationPicker } from "metabase/querying/common/components/AggregationPicker";
import { BreakoutPopover } from "metabase/querying/notebook/components/BreakoutStep";
import {
  NotebookCell,
  NotebookCellItem,
} from "metabase/querying/notebook/components/NotebookCell";
import { Box, Flex, Icon, Popover } from "metabase/ui";
import * as Lib from "metabase-lib";

import {
  type ExpressionBarProps,
  forwardKey,
  useSearchSync,
} from "./ExpressionBar";
import S from "./ExpressionBar.module.css";

const COLOR = "core-summarize";

/**
 * The Summarize step without "+" buttons: metrics and groupings are pills
 * you type after, like the filter bar. Click anywhere in a cell for the
 * caret; typing searches the picker, Enter picks, Backspace removes the
 * last pill. Each pill still opens its own picker on click.
 */
export function SummarizeBar({
  query,
  stageIndex,
  onChange,
}: ExpressionBarProps) {
  const aggregations = useMemo(
    () => Lib.aggregations(query, stageIndex),
    [query, stageIndex],
  );
  const breakouts = useMemo(
    () => Lib.breakouts(query, stageIndex),
    [query, stageIndex],
  );
  const remove = (clause: Lib.Clause) =>
    onChange(Lib.removeClause(query, stageIndex, clause));
  const label = (clause: Lib.AggregationClause | Lib.BreakoutClause) =>
    Lib.displayInfo(query, stageIndex, clause).longDisplayName;

  const aggregationPicker = (
    onClose: () => void,
    clause?: Lib.AggregationClause,
    clauseIndex?: number,
  ) => (
    <AggregationPicker
      query={query}
      stageIndex={stageIndex}
      clause={clause}
      clauseIndex={clauseIndex}
      operators={
        clause
          ? Lib.selectedAggregationOperators(
              Lib.availableAggregationOperators(query, stageIndex),
              clause,
            )
          : Lib.availableAggregationOperators(query, stageIndex)
      }
      allowCustomExpressions
      onQueryChange={onChange}
      onClose={onClose}
    />
  );

  const breakoutPicker = (
    onClose: () => void,
    clause?: Lib.BreakoutClause,
    clauseIndex?: number,
  ) => (
    <BreakoutPopover
      query={query}
      stageIndex={stageIndex}
      breakout={clause}
      breakoutIndex={clauseIndex}
      onAddBreakout={(column) =>
        onChange(Lib.breakout(query, stageIndex, column))
      }
      onUpdateBreakoutColumn={(breakout, column) =>
        onChange(Lib.replaceClause(query, stageIndex, breakout, column))
      }
      onClose={onClose}
    />
  );

  return (
    <Flex align="center" gap="sm" w="100%">
      <TypedCell
        placeholder={t`Type a function or metric…`}
        items={aggregations.map((clause, index) => ({
          label: label(clause),
          onRemove: () => remove(clause),
          renderPicker: (onClose) => aggregationPicker(onClose, clause, index),
        }))}
        renderAddPicker={(onClose) => aggregationPicker(onClose)}
      />
      <Box c={COLOR} fw="bold">{t`by`}</Box>
      <TypedCell
        placeholder={t`Type a column to group by…`}
        items={breakouts.map((clause, index) => ({
          label: label(clause),
          onRemove: () => remove(clause),
          renderPicker: (onClose) => breakoutPicker(onClose, clause, index),
        }))}
        renderAddPicker={(onClose) => breakoutPicker(onClose)}
      />
    </Flex>
  );
}

type CellItem = {
  label: string;
  onRemove: () => void;
  renderPicker: (onClose: () => void) => ReactNode;
};

type TypedCellProps = {
  placeholder: string;
  items: CellItem[];
  renderAddPicker: (onClose: () => void) => ReactNode;
};

function TypedCell({ placeholder, items, renderAddPicker }: TypedCellProps) {
  const [text, setText] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [hasFocus, setHasFocus] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  useSearchSync(listRef, text, isOpen, true);

  const close = () => {
    setText("");
    setIsOpen(false);
  };

  const handleCellClick = (event: MouseEvent<HTMLDivElement>) => {
    const isOnPill =
      event.target instanceof Element &&
      event.target.closest("[data-cell-pill]");
    if (!isOnPill) {
      setIsOpen(true);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setIsOpen(true);
      forwardKey(listRef, event.key);
    } else if (event.key === "Enter") {
      event.preventDefault();
      forwardKey(listRef, "Enter");
    } else if (event.key === "Escape") {
      event.preventDefault();
      if (isOpen) {
        close();
      } else {
        event.currentTarget.blur();
      }
    } else if (event.key === "Backspace" && text === "" && items.length > 0) {
      event.preventDefault();
      items[items.length - 1].onRemove();
    }
  };

  return (
    <NotebookCell
      color={COLOR}
      flex="1 1 50%"
      className={S.typedCell}
      onClick={handleCellClick}
    >
      {items.map((item, index) => (
        <CellPill key={index} item={item} />
      ))}
      <Popover
        opened={isOpen}
        position="bottom-start"
        trapFocus={false}
        returnFocus={false}
        transitionProps={{ duration: 0 }}
        onChange={(opened) => !opened && close()}
      >
        <Popover.Target>
          <span className={S.typing}>
            <input
              ref={inputRef}
              className={S.input}
              style={{
                width: `calc(${text.length}ch + 2px)`,
                caretColor: `var(--mb-color-${COLOR})`,
              }}
              value={text}
              aria-label={placeholder}
              onChange={(event) => {
                setText(event.target.value);
                setIsOpen(true);
              }}
              onFocus={() => {
                setHasFocus(true);
                setIsOpen(true);
              }}
              onBlur={() => setHasFocus(false)}
              onKeyDown={handleKeyDown}
            />
          </span>
        </Popover.Target>
        <Popover.Dropdown>
          <PickerList listRef={listRef}>
            {renderAddPicker(() => {
              close();
              inputRef.current?.focus();
            })}
          </PickerList>
        </Popover.Dropdown>
      </Popover>
      {items.length === 0 && text === "" && !hasFocus && (
        <span className={S.placeholder}>{placeholder}</span>
      )}
    </NotebookCell>
  );
}

function CellPill({ item }: { item: CellItem }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <Popover
      opened={isOpen}
      position="bottom-start"
      transitionProps={{ duration: 0 }}
      onChange={setIsOpen}
    >
      <Popover.Target>
        <Box data-cell-pill>
          <NotebookCellItem
            color={COLOR}
            onClick={() => setIsOpen((opened) => !opened)}
          >
            {item.label}
            <Icon
              className={S.notebookPillClose}
              name="close"
              onClick={(event) => {
                event.stopPropagation();
                item.onRemove();
              }}
            />
          </NotebookCellItem>
        </Box>
      </Popover.Target>
      <Popover.Dropdown>
        {item.renderPicker(() => setIsOpen(false))}
      </Popover.Dropdown>
    </Popover>
  );
}

/** The picker's own search box is driven by the caret, so it is hidden. */
function PickerList({
  listRef,
  children,
}: {
  listRef: RefObject<HTMLDivElement>;
  children: ReactNode;
}) {
  return (
    <Box ref={listRef} className={S.columnList}>
      {children}
    </Box>
  );
}
