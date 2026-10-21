import { PointerSensor, useSensor } from "@dnd-kit/core";
import { t } from "ttag";

import {
  type DragEndEvent,
  SortableList,
} from "metabase/common/components/Sortable";
import { Stack, Text, Title } from "metabase/ui";

import type { ActionField } from "../hooks";

import { ActionFieldItem } from "./ActionFieldItem";

type ActionFieldListProps = {
  fields: ActionField[];
  activeFieldId: string | undefined;
  readOnly: boolean;
  getFieldUrl: (fieldId: string) => string;
  onReorder: (fieldIds: string[]) => void;
};

const getFieldId = (field: ActionField) => field.parameter.id;

export function ActionFieldList({
  fields,
  activeFieldId,
  readOnly,
  getFieldUrl,
  onReorder,
}: ActionFieldListProps) {
  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 15 },
  });
  const isDraggable = !readOnly && fields.length > 1;

  const handleSortEnd = ({ itemIds }: DragEndEvent) => {
    onReorder(itemIds.map(String));
  };

  return (
    <Stack gap="lg" py="xl">
      <Stack gap="xs">
        <Title order={4}>{t`Fields`}</Title>
        <Text c="text-secondary">
          {getFieldsDescription(fields.length, isDraggable)}
        </Text>
      </Stack>
      <Stack gap="md" role="list">
        <SortableList<ActionField>
          items={fields}
          getId={getFieldId}
          sensors={[pointerSensor]}
          renderItem={({ item: field }) => (
            <ActionFieldItem
              key={field.parameter.id}
              field={field}
              href={getFieldUrl(field.parameter.id)}
              isActive={field.parameter.id === activeFieldId}
              isDraggable={isDraggable}
            />
          )}
          onSortEnd={handleSortEnd}
        />
      </Stack>
    </Stack>
  );
}

function getFieldsDescription(fieldCount: number, isDraggable: boolean) {
  if (fieldCount === 0) {
    return t`This action has no variables in its SQL.`;
  }
  return isDraggable
    ? t`One field per {{variable}} in the SQL. Drag to reorder the form.`
    : t`One field per {{variable}} in the SQL.`;
}
