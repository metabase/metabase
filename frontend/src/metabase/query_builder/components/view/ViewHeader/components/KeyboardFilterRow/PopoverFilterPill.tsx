import { useState } from "react";
import { t } from "ttag";

import { FilterPicker } from "metabase/querying/filters/components/FilterPicker";
import { Icon, Popover } from "metabase/ui";
import * as Lib from "metabase-lib";

import S from "./KeyboardFilterRow.module.css";

interface PopoverFilterPillProps {
  query: Lib.Query;
  stageIndex: number;
  filter: Lib.FilterClause;
  filterIndex: number;
  onChange: (query: Lib.Query) => void;
}

/**
 * Prototype: a pill for a filter that the inline pill cannot edit, like a
 * date filter. It looks like the other pills and opens the filter picker.
 */
export function PopoverFilterPill({
  query,
  stageIndex,
  filter,
  filterIndex,
  onChange,
}: PopoverFilterPillProps) {
  const [isOpened, setIsOpened] = useState(false);
  const { columnName, rest } = getNameParts(query, stageIndex, filter);

  const handleSelect = (newFilter: Lib.Clause | Lib.SegmentMetadata) => {
    onChange(Lib.replaceClause(query, stageIndex, filter, newFilter));
    setIsOpened(false);
  };

  const handleRemove = () => {
    onChange(Lib.removeClause(query, stageIndex, filter));
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
          className={S.pill}
          data-testid="filter-pill"
          onClick={() => setIsOpened((isOpened) => !isOpened)}
        >
          {columnName != null && (
            <span className={S.columnSegment}>{columnName}</span>
          )}
          <span>{rest}</span>
          <Icon
            className={S.removeIcon}
            name="close"
            size={12}
            role="button"
            aria-label={t`Remove filter`}
            onClick={(event) => {
              event.stopPropagation();
              handleRemove();
            }}
          />
        </div>
      </Popover.Target>
      <Popover.Dropdown data-testid="filter-picker-dropdown">
        <FilterPicker
          query={query}
          stageIndex={stageIndex}
          filter={filter}
          filterIndex={filterIndex}
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
