import { type KeyboardEvent, useEffect, useMemo, useState } from "react";
import { msgid, ngettext, t } from "ttag";

import {
  HoverParent,
  QueryColumnInfoIcon,
} from "metabase/common/components/MetadataInfo/QueryColumnInfoIcon";
import { useTranslateContent } from "metabase/content-translation/hooks";
import {
  Checkbox,
  Combobox,
  DelayGroup,
  Icon,
  Input,
  useCombobox,
} from "metabase/ui";
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
  const [searchText, setSearchText] = useState("");
  // The options are always visible, so the store stays "open": arrow keys
  // navigate straight away and Escape can't collapse the list.
  const combobox = useCombobox({ opened: true });

  const items = useMemo(() => {
    const items = columns.map((column) => ({
      column,
      columnInfo: Lib.displayInfo(query, stageIndex, column),
    }));
    return items.map((item, index) => ({
      ...item,
      // Display names aren't guaranteed unique, so identify rows by position.
      id: String(index),
      title: tc(item.columnInfo.displayName),
      isSelected: isColumnSelected(item, items),
      isDisabled: isColumnDisabled?.(item, items) ?? false,
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

  const { selectFirstOption } = combobox;
  // Passive so it runs after Combobox.Options has registered its list id.
  useEffect(() => {
    selectFirstOption();
  }, [selectFirstOption, normalizedSearchText]);

  const isAll = items.every((item) => item.isSelected);
  const isNone = items.every((item) => !item.isSelected);

  const handleLabelToggle = () => {
    if (isAll) {
      onSelectNone();
    } else {
      onSelectAll();
    }
  };

  const handleOptionSubmit = (id: string) => {
    const item = items.find((item) => item.id === id);
    if (item && !item.isDisabled) {
      onToggle(item.column, !item.isSelected);
    }
  };

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape" && searchText.length > 0) {
      // Clear the query first; a second Escape reaches the popover and closes it.
      event.preventDefault();
      event.stopPropagation();
      setSearchText("");
    }
  };

  return (
    <div data-testid={props["data-testid"]}>
      <Combobox
        store={combobox}
        onOptionSubmit={handleOptionSubmit}
        classNames={{
          search: S.Search,
          options: S.Options,
          option: S.Option,
          empty: S.Empty,
        }}
      >
        {isSearchable && (
          <div className={S.SearchContainer}>
            <Combobox.Search
              aria-label={t`Search columns`}
              placeholder={t`Search columns…`}
              value={searchText}
              autoFocus={!isTouchDevice()}
              leftSection={<Icon name="search" />}
              rightSectionPointerEvents="all"
              rightSection={
                searchText.length > 0 ? (
                  <Input.ClearButton
                    aria-label={t`Clear search`}
                    c="text-secondary"
                    onClick={() => setSearchText("")}
                  />
                ) : null
              }
              onChange={(event) => setSearchText(event.currentTarget.value)}
              onKeyDown={handleSearchKeyDown}
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
        <div className={S.List}>
          {!isSearching && (
            <label className={S.ToggleRow}>
              <Combobox.EventsTarget withAriaAttributes={false}>
                <Checkbox
                  variant="stacked"
                  checked={isAll}
                  indeterminate={!isAll && !isNone}
                  onChange={handleLabelToggle}
                />
              </Combobox.EventsTarget>
              <div className={S.ItemTitle}>{t`Select all`}</div>
            </label>
          )}
          <Combobox.Options aria-label={t`Columns`} aria-multiselectable="true">
            <DelayGroup>
              {visibleItems.map((item) => (
                <Combobox.Option
                  key={item.id}
                  value={item.id}
                  disabled={item.isDisabled}
                  aria-label={item.title}
                  aria-checked={item.isSelected}
                  aria-disabled={item.isDisabled || undefined}
                >
                  <HoverParent className={S.Row}>
                    <Checkbox
                      className={S.RowCheckbox}
                      checked={item.isSelected}
                      disabled={item.isDisabled}
                      readOnly
                      aria-hidden
                      tabIndex={-1}
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
                </Combobox.Option>
              ))}
            </DelayGroup>
            {isSearching && visibleItems.length === 0 && (
              <Combobox.Empty>{t`No columns found`}</Combobox.Empty>
            )}
          </Combobox.Options>
        </div>
      </Combobox>
    </div>
  );
};
