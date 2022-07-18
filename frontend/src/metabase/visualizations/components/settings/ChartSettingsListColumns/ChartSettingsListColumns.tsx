import React, { useCallback } from "react";
import { t } from "ttag";
import _ from "underscore";

import Button from "metabase/core/components/Button";

import { keyForColumn } from "metabase/lib/dataset";

import Question from "metabase-lib/lib/Question";

import { Column } from "metabase-types/types/Dataset";
import { FieldId } from "metabase-types/types/Field";
import { ConcreteField } from "metabase-types/types/Query";

import {
  ColumnItemContainer,
  GroupName,
  StyledSelect,
} from "./ChartSettingsListColumns.styled";

type FieldIdOrFieldRef = FieldId | ConcreteField;

type SettingValue = {
  left: FieldIdOrFieldRef[];
  right: FieldIdOrFieldRef[];
};

interface Props {
  value: SettingValue;
  columns: Column[];
  question: Question;
  onChange: (value: SettingValue) => void;
  onShowWidget: (config: unknown) => void;
}

type ListColumnSlot = "left" | "right";

type WrappedEvent = {
  target: {
    value: FieldIdOrFieldRef;
  };
};

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
    fieldIdOrFieldRef => {
      const column = columns.find(
        column =>
          column.id === fieldIdOrFieldRef ||
          _.isEqual(column.field_ref, fieldIdOrFieldRef),
      );
      if (column) {
        onShowWidget({
          id: "column_settings",
          props: {
            initialKey: keyForColumn(column),
          },
        });
      }
    },
    [columns, onShowWidget],
  );

  const columnOptions = columns.map(column => ({
    name: column.display_name,
    value: column.id || column.field_ref,
  }));

  const options = [
    {
      name: t`None`,
      value: null,
    },
    ...columnOptions,
  ];

  return (
    <div>
      <GroupName>{t`Left`}</GroupName>
      {value.left.map((fieldIdOrFieldRef, index) => (
        <ColumnItemContainer key={index}>
          <StyledSelect
            value={fieldIdOrFieldRef}
            options={options}
            onChange={(e: WrappedEvent) =>
              onChangeColumn("left", index, e.target.value)
            }
          />
          <Button
            icon="gear"
            onlyIcon
            disabled={fieldIdOrFieldRef === null}
            onClick={() => onColumnSettingsClick(fieldIdOrFieldRef)}
          />
        </ColumnItemContainer>
      ))}
      <GroupName>{t`Right`}</GroupName>
      {value.right.map((fieldIdOrFieldRef, index) => (
        <ColumnItemContainer key={index}>
          <StyledSelect
            key={index}
            value={fieldIdOrFieldRef}
            options={options}
            onChange={(e: WrappedEvent) =>
              onChangeColumn("right", index, e.target.value)
            }
          />
          <Button
            icon="gear"
            onlyIcon
            disabled={fieldIdOrFieldRef === null}
            onClick={() => onColumnSettingsClick(fieldIdOrFieldRef)}
          />
        </ColumnItemContainer>
      ))}
    </div>
  );
}

export default ChartSettingsListColumns;
