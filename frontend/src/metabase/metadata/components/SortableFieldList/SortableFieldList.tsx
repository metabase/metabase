import { PointerSensor, useSensor } from "@dnd-kit/core";
import { useMemo } from "react";
import _ from "underscore";

import {
  type DragEndEvent,
  SortableList,
} from "metabase/core/components/Sortable";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { Stack, rem } from "metabase/ui";
import type { Field, FieldId, Table } from "metabase-types/api";

import { SortableFieldItem } from "../SortableFieldItem";

interface Props {
  activeFieldId?: FieldId;
  table: Table;
  onChange: (fieldOrder: DragEndEvent["itemIds"]) => void;
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
  const isDragDisabled = fields.length <= 1;

  const handleSortEnd = ({ itemIds }: DragEndEvent) => {
    onChange(itemIds);
  };

  return (
    <Stack gap={rem(12)}>
      <SortableList<Field>
        getId={getRawTableFieldId}
        items={fields}
        renderItem={({ id, item: field }) => (
          <SortableFieldItem
            active={id === activeFieldId}
            disabled={isDragDisabled}
            field={field}
            key={id}
          />
        )}
        sensors={[pointerSensor]}
        onSortEnd={handleSortEnd}
      />
    </Stack>
  );
};
