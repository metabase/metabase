import cx from "classnames";
import type { KeyboardEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { t } from "ttag";

import { FilterPicker } from "metabase/querying/filters/components/FilterPicker";
import { Icon, Popover } from "metabase/ui";
import * as Lib from "metabase-lib";

import S from "./KeyboardFilterRow.module.css";

interface PopoverFilterPillProps {
  query: Lib.Query;
  stageIndex: number;
  filter: Lib.FilterClause;
  className?: string;
  /** The pill's attributes in the bar, like its index for the arrow keys. */
  pillAttributes?: Record<string, number | string>;
  /** The user picked a new filter in place of this one. */
  onSelect: (filter: Lib.Filterable) => void;
  onRemove: () => void;
  /** The picker opened or closed. */
  onOpenedChange?: (isOpened: boolean) => void;
  /** Left or Right pressed on the focused pill. */
  onLeave?: (isLeft: boolean) => void;
}

/**
 * Prototype: a pill for a filter that the inline pill cannot edit, like a
 * date filter. It looks like the other pills and opens the filter picker.
 */
export function PopoverFilterPill({
  query,
  stageIndex,
  filter,
  className,
  pillAttributes,
  onSelect,
  onRemove,
  onOpenedChange,
  onLeave,
}: PopoverFilterPillProps) {
  const [isOpened, setIsOpenedState] = useState(false);
  const { columnName, rest } = getNameParts(query, stageIndex, filter);
  // Prototype: the Figma "Opaque" and "Custom expression" pills.
  const isSegment = Lib.isSegmentFilter(query, stageIndex, filter);
  const isCustomExpression =
    !isSegment && !Lib.isStandardFilter(query, stageIndex, filter);

  const setIsOpened = (value: boolean) => {
    if (value !== isOpened) {
      onOpenedChange?.(value);
    }
    setIsOpenedState(value);
  };

  // Opened from the keyboard, the pill takes the focus back once its editor
  // closes, unless a click already moved it elsewhere.
  const pillRef = useRef<HTMLDivElement>(null);
  const isOpenedFromKeyRef = useRef(false);
  useEffect(() => {
    if (!isOpened && isOpenedFromKeyRef.current) {
      isOpenedFromKeyRef.current = false;
      const isFocusLost =
        document.activeElement == null ||
        document.activeElement === document.body;
      if (isFocusLost) {
        pillRef.current?.focus();
      }
    }
  }, [isOpened]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) {
      return;
    }
    // Prototype: ArrowDown opens the pill like Enter, as it opens a dropdown.
    if (event.key === "Enter" || event.key === "ArrowDown") {
      event.preventDefault();
      isOpenedFromKeyRef.current = true;
      setIsOpened(true);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      onLeave?.(event.key === "ArrowLeft");
    }
  };

  const handleSelect = (newFilter: Lib.Filterable) => {
    onSelect(newFilter);
    setIsOpened(false);
  };

  return (
    <Popover
      opened={isOpened}
      position="bottom-start"
      transitionProps={{ duration: 0 }}
      onChange={setIsOpened}
    >
      <Popover.Target>
        <div
          ref={pillRef}
          className={cx(className ?? S.pill, { [S.opaquePill]: isSegment })}
          data-testid="filter-pill"
          tabIndex={-1}
          onClick={() => setIsOpened(!isOpened)}
          onKeyDown={handleKeyDown}
          {...pillAttributes}
        >
          {isSegment ? (
            <>
              <Icon className={S.opaqueIcon} name="segment" size={10} />
              <span className={S.opaqueLabel}>{rest}</span>
            </>
          ) : isCustomExpression ? (
            <span className={S.customExpression}>{rest}</span>
          ) : (
            <>
              {columnName != null && (
                <span className={S.columnSegment}>{columnName}</span>
              )}
              <span>{rest}</span>
            </>
          )}
          <Icon
            className={S.removeIcon}
            name="close"
            size={12}
            role="button"
            aria-label={t`Remove filter`}
            onClick={(event) => {
              event.stopPropagation();
              onRemove();
            }}
          />
        </div>
      </Popover.Target>
      <Popover.Dropdown
        className={S.popover}
        data-testid="filter-picker-dropdown"
      >
        <FilterPicker
          query={query}
          stageIndex={stageIndex}
          filter={filter}
          onSelect={handleSelect}
          onClose={() => setIsOpened(false)}
        />
      </Popover.Dropdown>
    </Popover>
  );
}

function getNameParts(
  query: Lib.Query,
  stageIndex: number,
  filter: Lib.FilterClause,
) {
  const name = Lib.displayInfo(query, stageIndex, filter).displayName;
  const column = Lib.filterParts(query, stageIndex, filter)?.column;
  const columnName =
    column != null
      ? Lib.displayInfo(query, stageIndex, column).displayName
      : undefined;
  return columnName != null && name.startsWith(`${columnName} `)
    ? { columnName, rest: name.slice(columnName.length + 1) }
    : { columnName: undefined, rest: name };
}
