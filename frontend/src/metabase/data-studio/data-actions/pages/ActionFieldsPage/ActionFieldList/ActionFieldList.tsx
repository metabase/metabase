import { PointerSensor, useSensor } from "@dnd-kit/core";
import { t } from "ttag";

import {
  type DragEndEvent,
  SortableList,
} from "metabase/common/components/Sortable";
import { Stack, Text, Title } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { WritebackActionId } from "metabase-types/api";

import type { ActionField } from "../../../hooks/use-action-fields";

import { ActionFieldItem } from "./ActionFieldItem";

type ActionFieldListProps = {
  actionId: WritebackActionId;
  fields: ActionField[];
  activeFieldId: string | undefined;
  readOnly: boolean;
  onReorder: (fieldIds: string[]) => void;
};

const getFieldId = (field: ActionField) => field.parameter.id;

export function ActionFieldList({
  actionId,
  fields,
  activeFieldId,
  readOnly,
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
          {fields.length > 0
            ? t`One field per {{variable}} in the SQL. Drag to reorder the form.`
            : t`This action has no variables in its SQL.`}
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
              href={Urls.dataActionFields(actionId, field.parameter.id)}
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
