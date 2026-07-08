import { PointerSensor, useSensor } from "@dnd-kit/core";
import { useMemo } from "react";
import _ from "underscore";

import {
  type DragEndEvent,
  SortableList,
} from "metabase/common/components/Sortable";
import { Stack, rem } from "metabase/ui";
import type { Field, FieldId } from "metabase-types/api";

import { SortableFieldItem } from "../SortableFieldItem";

interface Props<T extends number | string> {
  fields: Field[];
  activeFieldKey?: FieldId;
  getFieldKey: (field: Field) => T;
  onChange: (fieldOrder: T[]) => void;
}

export function SortableFieldList<T extends number | string>({
  fields,
  activeFieldKey,
  getFieldKey,
  onChange,
}: Props<T>) {
  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 15 },
  });
  const fieldsByName = useMemo(() => {
    return _.indexBy(fields, (field) => field.name);
  }, [fields]);
  const isDragDisabled = fields.length <= 1;

  const handleSortEnd = ({ itemIds }: DragEndEvent) => {
    onChange(itemIds as T[]);
  };

  return (
    <Stack gap={rem(12)}>
      <SortableList<Field>
        items={fields}
        sensors={[pointerSensor]}
        getId={getFieldKey}
        renderItem={({ item: field }) => {
          const key = getFieldKey(field);
          const parentName = field.nfc_path?.[0] ?? "";
          const parent = fieldsByName[parentName];

          return (
            <SortableFieldItem
              key={key}
              field={field}
              fieldKey={key}
              parent={parent}
              active={getFieldKey(field) === activeFieldKey}
              disabled={isDragDisabled}
            />
          );
        }}
        onSortEnd={handleSortEnd}
      />
    </Stack>
  );
}
