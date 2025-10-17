import { PointerSensor, useSensor } from "@dnd-kit/core";
import { useCallback, useMemo } from "react";
import _ from "underscore";

import {
  type DragEndEvent,
  SortableList,
} from "metabase/common/components/Sortable";
import { SortableFieldItem } from "metabase/metadata/components";
import { Stack, rem } from "metabase/ui";
import { getSortedModelFields } from "metabase-lib/v1/metadata/utils/models"; // eslint-disable-line no-restricted-imports
import type { Card, Field, FieldName } from "metabase-types/api";

type Props = {
  model: Card;
  activeFieldName?: FieldName;
  onChange: (fieldOrder: FieldName[]) => void;
};

export const ModelSortableFieldList = ({
  activeFieldName,
  model,
  onChange,
}: Props) => {
  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 15 },
  });
  const fields = useMemo(() => {
    return getSortedModelFields(
      model.result_metadata,
      model.visualization_settings,
    );
  }, [model.result_metadata, model.visualization_settings]);
  const fieldsByName = useMemo(() => {
    return _.indexBy(fields, (field) => field.name);
  }, [fields]);
  const isDragDisabled = fields.length <= 1;

  const handleSortEnd = ({ itemIds }: DragEndEvent) => {
    onChange(itemIds as FieldName[]);
  };

  const getFieldId = useCallback((field: Field) => field.name, []);

  return (
    <Stack gap={rem(12)}>
      <SortableList<Field>
        getId={getFieldId}
        items={fields}
        renderItem={({ id, item: field }) => {
          const parentName = field.nfc_path?.[0] ?? "";
          const parent = fieldsByName[parentName];

          return (
            <SortableFieldItem
              fieldId={field.name}
              active={id === activeFieldName}
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
