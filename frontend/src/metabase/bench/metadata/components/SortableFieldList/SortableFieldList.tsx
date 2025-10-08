import { PointerSensor, useSensor } from "@dnd-kit/core";
import { useMemo } from "react";
import _ from "underscore";

import {
  type DragEndEvent,
  SortableList,
} from "metabase/common/components/Sortable";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { Stack, rem } from "metabase/ui";
import type { Field, FieldId, Table } from "metabase-types/api";

import { SortableFieldItem } from "../SortableFieldItem";

interface Props {
  activeFieldId?: FieldId;
  table: Table;
  onChange: (fieldOrder: FieldId[]) => void;
}

export const SortableFieldList = ({
  activeFieldId,
  table,
  onChange,
}: Props) => {
  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 15 },
  });
  const fields = useMemo(() => {
    return _.sortBy(table.fields ?? [], (item) => item.position);
  }, [table.fields]);
  const fieldsByName = useMemo(() => {
    return _.indexBy(fields, (field) => field.name);
  }, [fields]);
  const isDragDisabled = fields.length <= 1;

  const handleSortEnd = ({ itemIds }: DragEndEvent) => {
    // in this context field id will never be a string because it's a raw table field, so it's ok to cast
    onChange(itemIds as FieldId[]);
  };

  return (
    <Stack gap={rem(12)}>
      <SortableList<Field>
        getId={getRawTableFieldId}
        items={fields}
        renderItem={({ id, item: field }) => {
          const parentName = field.nfc_path?.[0] ?? "";
          const parent = fieldsByName[parentName];

          return (
            <SortableFieldItem
              active={id === activeFieldId}
              disabled={isDragDisabled}
              field={field}
              parent={parent}
              key={id}
            />
          );
        }}
        sensors={[pointerSensor]}
        onSortEnd={handleSortEnd}
      />
    </Stack>
  );
};
