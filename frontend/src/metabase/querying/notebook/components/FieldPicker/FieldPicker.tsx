import { type KeyboardEvent, useMemo, useRef, useState } from "react";
import { msgid, ngettext, t } from "ttag";

import { ListSearchField } from "metabase/common/components/ListSearchField";
import {
  HoverParent,
  QueryColumnInfoIcon,
} from "metabase/common/components/MetadataInfo/QueryColumnInfoIcon";
import { useTranslateContent } from "metabase/content-translation/hooks";
import { Checkbox, DelayGroup, Text } from "metabase/ui";
import { isTouchDevice } from "metabase/utils/browser";
import * as Lib from "metabase-lib";

import S from "./FieldPicker.module.css";

const SEARCHABLE_COLUMN_COUNT = 5;

export interface FieldPickerItem {
  column: Lib.ColumnMetadata;
  columnInfo: Lib.ColumnDisplayInfo;
}

interface FieldPickerProps {
  query: Lib.Query;
  stageIndex: number;
  columns: Lib.ColumnMetadata[];
  "data-testid"?: string;
  isColumnSelected: (
    item: FieldPickerItem,
    items: FieldPickerItem[],
  ) => boolean;
  isColumnDisabled?: (
    item: FieldPickerItem,
    items: FieldPickerItem[],
  ) => boolean;
  onToggle: (column: Lib.ColumnMetadata, isSelected: boolean) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
}

export const FieldPicker = ({
  query,
  stageIndex,
  columns,
  onToggle,
  onSelectAll,
  onSelectNone,
  isColumnSelected,
  isColumnDisabled,
  ...props
}: FieldPickerProps) => {
  const tc = useTranslateContent();
  const listRef = useRef<HTMLUListElement>(null);
  const [searchText, setSearchText] = useState("");

  const items = useMemo(() => {
    const items = columns.map((column) => ({
      column,
      columnInfo: Lib.displayInfo(query, stageIndex, column),
    }));
    return items.map((item) => ({
      ...item,
      title: tc(item.columnInfo.displayName),
      isSelected: isColumnSelected(item, items),
      isDisabled: isColumnDisabled?.(item, items),
    }));
  }, [query, stageIndex, columns, isColumnSelected, isColumnDisabled, tc]);

  // Gate on the full column count so the search box doesn't disappear once
  // the user has filtered the list down.
  const isSearchable = items.length > SEARCHABLE_COLUMN_COUNT;
  const normalizedSearchText = searchText.trim().toLowerCase();
  const isSearching = normalizedSearchText.length > 0;

  const visibleItems = useMemo(
    () =>
      isSearching
        ? items.filter((item) =>
            item.title.toLowerCase().includes(normalizedSearchText),
          )
        : items,
    [items, isSearching, normalizedSearchText],
  );

  const isAll = items.every((item) => item.isSelected);
  const isNone = items.every((item) => !item.isSelected);

  const handleLabelToggle = () => {
    if (isAll) {
      onSelectNone();
    } else {
      onSelectAll();
    }
  };

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      listRef.current
        ?.querySelector<HTMLInputElement>("input[type=checkbox]:not(:disabled)")
        ?.focus();
    } else if (event.key === "Escape" && searchText.length > 0) {
      // Clear the query first; a second Escape reaches the popover and closes it.
      event.preventDefault();
      event.stopPropagation();
      setSearchText("");
    }
  };

  return (
    <div
      role="group"
      aria-label={t`Columns`}
      data-testid={props["data-testid"]}
    >
      {isSearchable && (
        <div className={S.SearchContainer}>
          <ListSearchField
            aria-label={t`Search columns`}
            placeholder={t`Search columns…`}
            value={searchText}
            autoFocus={!isTouchDevice()}
            onChange={(event) => setSearchText(event.target.value)}
            onKeyDown={handleSearchKeyDown}
            onResetClick={() => setSearchText("")}
          />
          <div role="status" aria-live="polite" className={S.VisuallyHidden}>
            {isSearching &&
              ngettext(
                msgid`${visibleItems.length} column found`,
                `${visibleItems.length} columns found`,
                visibleItems.length,
              )}
          </div>
        </div>
      )}
      <ul ref={listRef} className={S.ItemList}>
        {!isSearching && (
          <li className={S.ToggleItem}>
            <HoverParent as="label" className={S.Label}>
              <Checkbox
                variant="stacked"
                checked={isAll}
                indeterminate={!isAll && !isNone}
                onChange={handleLabelToggle}
              />
              <div className={S.ItemTitle}>{t`Select all`}</div>
            </HoverParent>
          </li>
        )}
        <DelayGroup>
          {visibleItems.map((item) => (
            <li key={item.columnInfo.longDisplayName}>
              <HoverParent className={S.Label} as="label">
                <Checkbox
                  checked={item.isSelected}
                  disabled={item.isDisabled}
                  onChange={(event) =>
                    onToggle(item.column, event.target.checked)
                  }
                />
                <QueryColumnInfoIcon
                  className={S.ItemIcon}
                  query={query}
                  stageIndex={stageIndex}
                  column={item.column}
                  position="top-start"
                  size={16}
                />
                <div className={S.ItemTitle}>{item.title}</div>
              </HoverParent>
            </li>
          ))}
        </DelayGroup>
        {isSearching && visibleItems.length === 0 && (
          <li>
            <Text c="text-secondary" className={S.EmptyState}>
              {t`No columns found`}
            </Text>
          </li>
        )}
      </ul>
    </div>
  );
};
