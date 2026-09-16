import { useEffect, useMemo } from "react";
import { t } from "ttag";

import {
  HoverParent,
  QueryColumnInfoIcon,
} from "metabase/common/components/MetadataInfo/QueryColumnInfoIcon";
import { useTranslateContent } from "metabase/content-translation/hooks";
import { Checkbox, Combobox, DelayGroup, useCombobox } from "metabase/ui";
import * as Lib from "metabase-lib";

import S from "./FieldPicker.module.css";

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

  const { selectFirstOption } = combobox;
  useEffect(() => {
    selectFirstOption();
  }, [selectFirstOption]);

  const isAllSelected = items.every((item) => item.isSelected);
  const isNoneSelected = items.every((item) => !item.isSelected);
  // When every column is selected the control deselects them; otherwise it
  // selects the rest.
  const itemsToToggle = items.filter(
    (item) => !item.isDisabled && item.isSelected === isAllSelected,
  );

  const handleSelectAllChange = () => {
    onToggleColumns(
      itemsToToggle.map((item) => item.column),
      !isAllSelected,
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
        classNames={{ options: S.Options, option: S.Option }}
      >
        <div className={S.List}>
          <label className={S.ToggleRow}>
            <Combobox.EventsTarget withAriaAttributes={false}>
              <Checkbox
                variant="stacked"
                checked={isAllSelected}
                indeterminate={!isAllSelected && !isNoneSelected}
                disabled={itemsToToggle.length === 0}
                onChange={handleSelectAllChange}
              />
            </Combobox.EventsTarget>
            <div className={S.ItemTitle}>{t`Select all`}</div>
          </label>
          <Combobox.Options aria-label={t`Columns`} aria-multiselectable="true">
            <DelayGroup>
              {items.map((item) => (
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
          </Combobox.Options>
        </div>
      </Combobox>
    </div>
  );
};
