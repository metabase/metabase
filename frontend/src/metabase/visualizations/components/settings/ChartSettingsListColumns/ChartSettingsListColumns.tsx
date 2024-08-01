import type { ChangeEvent } from "react";
import { useCallback } from "react";
import { t } from "ttag";
import _ from "underscore";

import Button from "metabase/core/components/Button";
import type Question from "metabase-lib/v1/Question";
import { getColumnKey } from "metabase-lib/v1/queries/utils/column-key";
import type {
  ConcreteFieldReference,
  DatasetColumn,
  FieldId,
} from "metabase-types/api";

import {
  ColumnItemContainer,
  GroupName,
  StyledSelect,
} from "./ChartSettingsListColumns.styled";

type FieldIdOrFieldRef = FieldId | ConcreteFieldReference;

type SettingValue = {
  left: FieldIdOrFieldRef[];
  right: FieldIdOrFieldRef[];
};

interface Props {
  value: SettingValue;
  columns: DatasetColumn[];
  question: Question;
  onChange: (value: SettingValue) => void;
  onShowWidget: (config: unknown, targetElement: Element | null) => void;
}

type ListColumnSlot = "left" | "right";

function formatValueForSelect(value: FieldIdOrFieldRef): string | number {
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
    (fieldIdOrFieldRef: FieldIdOrFieldRef, targetElement: Element) => {
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

  return (
    <div>
      <GroupName>{t`Left`}</GroupName>
      {value.left.map((fieldIdOrFieldRef, index) => (
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
            onClick={(e: React.MouseEvent) =>
              onColumnSettingsClick(fieldIdOrFieldRef, e.currentTarget)
            }
          />
        </ColumnItemContainer>
      ))}
      <GroupName>{t`Right`}</GroupName>
      {value.right.map((fieldIdOrFieldRef, index) => (
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
            onClick={e =>
              onColumnSettingsClick(fieldIdOrFieldRef, e.currentTarget)
            }
          />
        </ColumnItemContainer>
      ))}
    </div>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ChartSettingsListColumns;
