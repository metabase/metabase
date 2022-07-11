import React, { useCallback } from "react";
import { t } from "ttag";

import Question from "metabase-lib/lib/Question";

import { Column } from "metabase-types/types/Dataset";
import { FieldId } from "metabase-types/types/Field";
import { ConcreteField } from "metabase-types/types/Query";

import { GroupName, StyledSelect } from "./ChartSettingsListColumns.styled";

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
}

type ListColumnSlot = "left" | "right";

type WrappedEvent = {
  target: {
    value: FieldIdOrFieldRef;
  };
};

function ChartSettingsListColumns({ value, columns, onChange }: Props) {
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

  const options = columns.map(column => ({
    name: column.display_name,
    value: column.id || column.field_ref,
  }));

  return (
    <div>
      <GroupName>{t`Left`}</GroupName>
      {value.left.map((fieldIdOrFieldRef, index) => (
        <StyledSelect
          key={index}
          value={fieldIdOrFieldRef}
          options={options}
          onChange={(e: WrappedEvent) =>
            onChangeColumn("left", index, e.target.value)
          }
        />
      ))}
      <GroupName>{t`Right`}</GroupName>
      {value.right.map((fieldIdOrFieldRef, index) => (
        <StyledSelect
          key={index}
          value={fieldIdOrFieldRef}
          options={options}
          onChange={(e: WrappedEvent) =>
            onChangeColumn("right", index, e.target.value)
          }
        />
      ))}
    </div>
  );
}

export default ChartSettingsListColumns;
