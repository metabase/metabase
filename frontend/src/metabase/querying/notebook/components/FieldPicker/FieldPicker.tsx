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
                checked={isAll}
                indeterminate={!isAll && !isNone}
                onChange={handleLabelToggle}
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
          </Combobox.Options>
        </div>
      </Combobox>
    </div>
  );
};
