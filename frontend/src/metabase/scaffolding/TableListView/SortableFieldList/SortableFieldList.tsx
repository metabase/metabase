import { PointerSensor, useSensor } from "@dnd-kit/core";
import { useMemo } from "react";
import _ from "underscore";

import {
  type DragEndEvent,
  SortableList,
} from "metabase/common/components/Sortable";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { Stack, rem } from "metabase/ui";
import type { Field, FieldId } from "metabase-types/api";

import { SortableFieldItem } from "../SortableFieldItem";

interface Props {
  disabled?: boolean;
  fields: Field[];
  isHidden?: boolean;
  onChange: (fieldOrder: FieldId[]) => void;
  onToggleVisibility: (field: Field) => void;
}

export const SortableFieldList = ({
  disabled,
  fields,
  isHidden,
  onChange,
  onToggleVisibility,
}: Props) => {
  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 15 },
  });
  const sortedFields = fields;
  // const sortedFields = useMemo(() => {
  //   return _.sortBy(fields ?? [], (item) => item.position);
  // }, [fields]);
  const fieldsByName = useMemo(() => {
    return _.indexBy(sortedFields, (field) => field.name);
  }, [sortedFields]);
  const isDragDisabled = disabled || sortedFields.length <= 1;

  const handleSortEnd = ({ itemIds }: DragEndEvent) => {
    // in this context field id will never be a string because it's a raw table field, so it's ok to cast
    onChange(itemIds as FieldId[]);
  };

  return (
    <Stack gap={rem(12)}>
      <SortableList<Field>
        getId={getRawTableFieldId}
        items={sortedFields}
        renderItem={({ id, item: field }) => {
          const parentName = field.nfc_path?.[0] ?? "";
          const parent = fieldsByName[parentName];

          return (
            <SortableFieldItem
              disabled={isDragDisabled}
              field={field}
              isHidden={isHidden}
              parent={parent}
              key={id}
              onToggleVisibility={onToggleVisibility}
            />
          );
        }}
        sensors={[pointerSensor]}
        onSortEnd={handleSortEnd}
      />
    </Stack>
  );
};
