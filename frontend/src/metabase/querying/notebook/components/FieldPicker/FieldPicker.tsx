import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react";
import { flushSync } from "react-dom";
import { msgid, ngettext, t } from "ttag";

import {
  HoverParent,
  QueryColumnInfoIcon,
} from "metabase/common/components/MetadataInfo/QueryColumnInfoIcon";
import { useTranslateContent } from "metabase/content-translation/hooks";
import visuallyHidden from "metabase/css/core/visually-hidden.module.css";
import {
  Checkbox,
  type CheckboxProps,
  Combobox,
  DelayGroup,
  Icon,
  Input,
  useCombobox,
} from "metabase/ui";
import { isTouchDevice } from "metabase/utils/browser";
import * as Lib from "metabase-lib";

import S from "./FieldPicker.module.css";

export const MIN_SEARCHABLE_COLUMN_COUNT = 10;

// Column option values are indices, so this can't collide with one.
const SELECT_ALL_VALUE = "select-all";

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
  const isSearchable = items.length >= MIN_SEARCHABLE_COLUMN_COUNT;
  const normalizedSearchText = searchText.trim().toLowerCase();
  const isSearching = normalizedSearchText.length > 0;
  const isSearchAutofocused = isSearchable && shouldFocusSearch;

  const visibleItems = useMemo(
    () =>
      isSearching
        ? items.filter((item) =>
            item.title.toLowerCase().includes(normalizedSearchText),
          )
        : items,
    [items, isSearching, normalizedSearchText],
  );

  const hasSelectAll = visibleItems.length > 0;
  const { selectFirstOption, selectNextOption, getSelectedOptionIndex } =
    combobox;

  const highlightFirstColumn = useCallback(() => {
    selectFirstOption();

    const hasSelectedSelectAll = getSelectedOptionIndex() === 0;
    if (hasSelectedSelectAll) {
      /**
       * Reasons to skip "Select all" and select the first actual column:
       * - When searching you expect the first match to toggle
       * - An accidental "Select all" is lossy
       */
      selectNextOption();
    }
  }, [selectFirstOption, selectNextOption, getSelectedOptionIndex]);

  useEffect(() => {
    highlightFirstColumn();
  }, [highlightFirstColumn]);

  const isAllVisibleSelected = visibleItems.every((item) => item.isSelected);
  const isNoneVisibleSelected = visibleItems.every((item) => !item.isSelected);
  // When every visible column is selected the control deselects them;
  // otherwise it selects the rest.
  const itemsToToggle = visibleItems.filter(
    (item) => !item.isDisabled && item.isSelected === isAllVisibleSelected,
  );

  const handleSearchChange = (value: string) => {
    // highlightFirstColumn reads the rendered options, so commit the filtered
    // list first.
    flushSync(() => setSearchText(value));
    highlightFirstColumn();
  };

  const handleSearchClear = () => {
    handleSearchChange("");
    // The clear button unmounts once the search is empty, which would drop
    // focus to the document body.
    combobox.focusSearchInput();
  };

  const handleOptionSubmit = (id: string) => {
    if (id === SELECT_ALL_VALUE) {
      onToggleColumns(
        itemsToToggle.map((item) => item.column),
        !isAllVisibleSelected,
      );
      return;
    }
    const item = items.find((item) => item.id === id);
    if (item && !item.isDisabled) {
      onToggle(item.column, !item.isSelected);
    }
  };

  const handleListKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === " " && combobox.getSelectedOptionIndex() !== -1) {
      event.preventDefault();
      combobox.clickSelectedOption();
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
              data-autofocus={isSearchAutofocused || undefined}
              leftSection={<Icon name="search" />}
              rightSectionPointerEvents="all"
              rightSection={
                searchText.length > 0 ? (
                  <Input.ClearButton
                    aria-label={t`Clear search`}
                    c="text-secondary"
                    onClick={handleSearchClear}
                  />
                ) : null
              }
              onChange={(event) =>
                handleSearchChange(event.currentTarget.value)
              }
            />
            <div
              id={matchCountId}
              role="status"
              aria-live="polite"
              className={visuallyHidden.visuallyHidden}
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
          {/* The listbox itself takes focus and drives navigation via
              aria-activedescendant; drop the attributes that only make sense
              on a combobox input. */}
          <Combobox.EventsTarget
            aria-haspopup={undefined}
            aria-controls={undefined}
          >
            <Combobox.Options
              aria-label={t`Columns`}
              aria-multiselectable="true"
              tabIndex={0}
              data-autofocus={!isSearchAutofocused || undefined}
              onKeyDown={handleListKeyDown}
            >
              {hasSelectAll && (
                <SelectAllOption
                  label={isSearching ? t`Select all of these` : t`Select all`}
                  checked={isAllVisibleSelected}
                  indeterminate={
                    !isAllVisibleSelected && !isNoneVisibleSelected
                  }
                  disabled={itemsToToggle.length === 0}
                  descriptionId={isSearching ? matchCountId : undefined}
                />
              )}
              {visibleItems.length > 0 && (
                <Combobox.Group className={S.ColumnGroup}>
                  <DelayGroup>
                    {visibleItems.map((item) => (
                      <Combobox.Option
                        key={item.id}
                        value={item.id}
                        disabled={item.isDisabled}
                        aria-label={item.title}
                        aria-selected={item.isSelected}
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
                </Combobox.Group>
              )}
              {isSearching && visibleItems.length === 0 && (
                <Combobox.Empty>{t`No columns found`}</Combobox.Empty>
              )}
            </Combobox.Options>
          </Combobox.EventsTarget>
        </div>
      </Combobox>
    </div>
  );
};

interface SelectAllOptionProps extends Pick<
  CheckboxProps,
  "checked" | "indeterminate" | "disabled"
> {
  label: string;
  descriptionId?: string;
}

function SelectAllOption({
  label,
  checked,
  indeterminate,
  disabled,
  descriptionId,
}: SelectAllOptionProps) {
  return (
    <Combobox.Option
      value={SELECT_ALL_VALUE}
      disabled={disabled}
      aria-label={label}
      // Mantine rewrites aria-selected to mark the keyboard highlight, and
      // aria-checked can also express the partial state.
      aria-checked={indeterminate ? "mixed" : checked}
      aria-disabled={disabled || undefined}
      aria-describedby={descriptionId}
    >
      <div className={S.ToggleRow}>
        <Checkbox
          className={S.RowCheckbox}
          variant="stacked"
          checked={checked}
          indeterminate={indeterminate}
          disabled={disabled}
          readOnly
          aria-hidden
          tabIndex={-1}
        />
        <div className={S.ItemTitle}>{label}</div>
      </div>
    </Combobox.Option>
  );
}
