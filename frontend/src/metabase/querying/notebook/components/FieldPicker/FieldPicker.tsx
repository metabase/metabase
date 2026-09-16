import { useEffect, useId, useMemo, useState } from "react";
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

export const SEARCHABLE_COLUMN_COUNT = 9;

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
  onToggleColumns: (columns: Lib.ColumnMetadata[], isSelected: boolean) => void;
}

export const FieldPicker = ({
  query,
  stageIndex,
  columns,
  onToggle,
  onToggleColumns,
  isColumnSelected,
  isColumnDisabled,
  ...props
}: FieldPickerProps) => {
  const tc = useTranslateContent();
  const matchCountId = useId();
  // The popover's focus trap places focus. Plain autoFocus would fire before
  // the popover records where to return focus on close. On a touch device,
  // focusing the search box would open the on-screen keyboard over the list.
  const shouldFocusSearch = !isTouchDevice();
  const [searchText, setSearchText] = useState("");

  const combobox = useCombobox({ opened: true });

  const items = useMemo(() => {
    const items = columns.map((column) => ({
      column,
      columnInfo: Lib.displayInfo(query, stageIndex, column),
    }));
    return items.map((item, index) => ({
      ...item,
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
  useEffect(() => {
    selectFirstOption();
  }, [selectFirstOption, normalizedSearchText]);

  const isAllVisibleSelected = visibleItems.every((item) => item.isSelected);
  const isNoneVisibleSelected = visibleItems.every((item) => !item.isSelected);
  // When every visible column is selected the control deselects them;
  // otherwise it selects the rest.
  const itemsToToggle = visibleItems.filter(
    (item) => !item.isDisabled && item.isSelected === isAllVisibleSelected,
  );

  const handleSelectAllChange = () => {
    onToggleColumns(
      itemsToToggle.map((item) => item.column),
      !isAllVisibleSelected,
    );
  };

  const handleOptionSubmit = (id: string) => {
    const item = items.find((item) => item.id === id);
    if (item && !item.isDisabled) {
      onToggle(item.column, !item.isSelected);
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
              data-autofocus={shouldFocusSearch || undefined}
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
            />
            <div
              id={matchCountId}
              role="status"
              aria-live="polite"
              className={S.VisuallyHidden}
            >
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
          {visibleItems.length > 0 && (
            <SelectAllRow
              label={isSearching ? t`Select all of these` : t`Select all`}
              checked={isAllVisibleSelected}
              indeterminate={!isAllVisibleSelected && !isNoneVisibleSelected}
              disabled={itemsToToggle.length === 0}
              descriptionId={isSearching ? matchCountId : undefined}
              withKeyboardNavigation={!isSearchable}
              onChange={handleSelectAllChange}
            />
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

interface SelectAllRowProps {
  label: string;
  checked: boolean;
  indeterminate: boolean;
  disabled: boolean;
  descriptionId?: string;
  withKeyboardNavigation: boolean;
  onChange: () => void;
}

function SelectAllRow({
  label,
  descriptionId,
  withKeyboardNavigation,
  ...checkboxProps
}: SelectAllRowProps) {
  // The popover's focus trap focuses the first [data-autofocus] element, so
  // this only takes focus when the search box isn't autofocusable.
  const checkbox = (
    <Checkbox
      variant="stacked"
      data-autofocus
      aria-describedby={descriptionId}
      {...checkboxProps}
    />
  );

  // The search box, when present, drives list navigation; a second events
  // target would make Enter here toggle the highlighted row instead.
  return (
    <label className={S.ToggleRow}>
      {withKeyboardNavigation ? (
        <Combobox.EventsTarget withAriaAttributes={false}>
          {checkbox}
        </Combobox.EventsTarget>
      ) : (
        checkbox
      )}
      <div className={S.ItemTitle}>{label}</div>
    </label>
  );
}
