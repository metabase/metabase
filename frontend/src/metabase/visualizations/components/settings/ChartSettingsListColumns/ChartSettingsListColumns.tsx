import React, { useCallback, ChangeEvent } from "react";
import { t } from "ttag";
import _ from "underscore";

import Button from "metabase/core/components/Button";

import { FieldId } from "metabase-types/types/Field";
import { ConcreteField } from "metabase-types/types/Query";
import { DatasetColumn } from "metabase-types/api";
import { getColumnKey } from "metabase-lib/queries/utils/get-column-key";
import Question from "metabase-lib/Question";

import {
  ColumnItemContainer,
  GroupName,
  StyledSelect,
} from "./ChartSettingsListColumns.styled";

type FieldIdOrFieldRef = FieldId | ConcreteField;

type SettingValue = {
  image: FieldIdOrFieldRef[];
  left: FieldIdOrFieldRef[];
  right: FieldIdOrFieldRef[];
};

interface Props {
  value: SettingValue;
  columns: DatasetColumn[];
  question: Question;
  onChange: (value: SettingValue) => void;
  onShowWidget: (config: unknown, targetElement: HTMLElement | null) => void;
}

type ListColumnSlot = "left" | "right" | "image";

function formatValueForSelect(
  value: FieldIdOrFieldRef | null,
): string | number | null {
  const isFieldReference = Array.isArray(value);
  return isFieldReference ? JSON.stringify(value) : value;
}

function parseSelectValue(
  event: ChangeEvent<HTMLSelectElement>,
): FieldIdOrFieldRef {
  const eventValue = event.target.value;
  const isFieldReference = typeof eventValue === "string";
  return isFieldReference ? JSON.parse(eventValue) : eventValue;
}

function ChartSettingsListColumns({
  value,
  columns,
  onChange,
  onShowWidget,
}: Props) {
  const onChangeColumn = useCallback(
    (slot: ListColumnSlot, index: number, val: FieldIdOrFieldRef) => {
      onChange({
        ...value,
        [slot]: [
          ...value[slot].slice(0, index),
          val,
          ...value[slot].slice(index + 1),
        ],
      });
    },
    [value, onChange],
  );

  const onColumnSettingsClick = useCallback(
    (fieldIdOrFieldRef, targetElement) => {
      const column = columns.find(
        column =>
          column.id === fieldIdOrFieldRef ||
          _.isEqual(column.field_ref, fieldIdOrFieldRef),
      );
      if (column) {
        onShowWidget(
          {
            id: "column_settings",
            props: {
              initialKey: getColumnKey(column),
            },
          },
          targetElement,
        );
      }
    },
    [columns, onShowWidget],
  );

  const columnOptions = columns.map(column => ({
    name: column.display_name,
    value: column.id || JSON.stringify(column.field_ref),
  }));

  const options = [
    {
      name: t`None`,
      value: null,
    },
    ...columnOptions,
  ];

  const nullIfEmpty = (value: FieldIdOrFieldRef[]) =>
    value?.length ? value : [null];

  return (
    <div>
      <GroupName>{t`Image`}</GroupName>
      {nullIfEmpty(value.image).map((fieldIdOrFieldRef, index) => (
        <ColumnItemContainer key={index}>
          <StyledSelect
            value={formatValueForSelect(fieldIdOrFieldRef)}
            options={options}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => {
              onChangeColumn("image", index, parseSelectValue(e));
            }}
          />
          <Button
            icon="gear"
            onlyIcon
            disabled={fieldIdOrFieldRef === null}
            onClick={e => onColumnSettingsClick(fieldIdOrFieldRef, e.target)}
          />
        </ColumnItemContainer>
      ))}
      <GroupName>{t`Left`}</GroupName>
      {nullIfEmpty(value.left).map((fieldIdOrFieldRef, index) => (
        <ColumnItemContainer key={index}>
          <StyledSelect
            value={formatValueForSelect(fieldIdOrFieldRef)}
            options={options}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => {
              onChangeColumn("left", index, parseSelectValue(e));
            }}
          />
          <Button
            icon="gear"
            onlyIcon
            disabled={fieldIdOrFieldRef === null}
            onClick={e => onColumnSettingsClick(fieldIdOrFieldRef, e.target)}
          />
        </ColumnItemContainer>
      ))}
      <GroupName>{t`Right`}</GroupName>
      {nullIfEmpty(value.right).map((fieldIdOrFieldRef, index) => (
        <ColumnItemContainer key={index}>
          <StyledSelect
            key={index}
            value={formatValueForSelect(fieldIdOrFieldRef)}
            options={options}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => {
              onChangeColumn("right", index, parseSelectValue(e));
            }}
          />
          <Button
            icon="gear"
            onlyIcon
            disabled={fieldIdOrFieldRef === null}
            onClick={e => onColumnSettingsClick(fieldIdOrFieldRef, e.target)}
          />
        </ColumnItemContainer>
      ))}
    </div>
  );
}

export default ChartSettingsListColumns;
