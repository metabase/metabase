import { t } from "ttag";

import {
  useUpdateTableFieldsOrderMutation,
  useUpdateTableMutation,
} from "metabase/api";
import { useToast } from "metabase/common/hooks";
import {
  DiscardTableFieldValuesButton,
  FieldOrderPicker,
  NameDescriptionInput,
  RescanTableFieldsButton,
  SortableFieldList,
} from "metabase/metadata/components";
import {
  type RouteParams,
  getUrl,
  parseRouteParams,
} from "metabase/metadata/utils/route-params";
import { Card, Flex, Stack, Switch, Text } from "metabase/ui";
import type { FieldId, Table } from "metabase-types/api";

interface Props {
  params: RouteParams;
  table: Table;
}

export const TableSection = ({ params, table }: Props) => {
  const { fieldId, ...parsedParams } = parseRouteParams(params);
  const [updateTable] = useUpdateTableMutation();
  const [updateTableFieldsOrder] = useUpdateTableFieldsOrderMutation();
  const [sendToast] = useToast();
  function confirm(message: string) {
    sendToast({ message, icon: "check" });
  }

  return (
    <Stack gap="lg">
      <NameDescriptionInput
        description={table.description ?? ""}
        descriptionPlaceholder={t`Give this table a description`}
        name={table.display_name}
        namePlaceholder={t`Give this table a name`}
        onDescriptionChange={async (description) => {
          await updateTable({ id: table.id, description });
          confirm(t`Table description updated`);
        }}
        onNameChange={async (name) => {
          await updateTable({ id: table.id, display_name: name });
          confirm(t`Table name updated`);
        }}
      />

      <Stack gap="sm">
        <Text fw="bold" size="sm">{t`Table visibility`}</Text>

        <Card bg="accent-gray-light" p="sm" radius="md" shadow="none">
          <Switch
            checked={table.visibility_type === "hidden"}
            label={t`Hide this table`}
            size="sm"
            onChange={async (event) => {
              const visibilityType = event.target.checked ? "hidden" : null;
              await updateTable({
                id: table.id,
                visibility_type: visibilityType,
              });
              confirm(t`Table visibility updated`);
            }}
          />
        </Card>
      </Stack>

      <Stack gap="sm">
        <Flex align="flex-end" gap="md" justify="space-between">
          <Text fw="bold" size="sm">{t`Fields`}</Text>

          <FieldOrderPicker
            value={table.field_order}
            onChange={(fieldOrder) => {
              updateTable({ id: table.id, field_order: fieldOrder });
              confirm(t`Field order updated`);
            }}
          />
        </Flex>

        <SortableFieldList
          activeFieldId={fieldId}
          getFieldHref={(fieldId) => getUrl({ ...parsedParams, fieldId })}
          table={table}
          onChange={async (fieldOrder) => {
            await updateTableFieldsOrder({
              id: table.id,
              // in this context field id will never be a string because it's a raw table field, so it's ok to cast
              field_order: fieldOrder as FieldId[],
            });
            confirm(t`Field order updated`);
          }}
        />
      </Stack>

      <Stack gap="sm">
        <Text c="text-secondary" mb="md" mt="lg" size="sm" ta="center">
          {/* eslint-disable-next-line no-literal-metabase-strings -- Admin settings */}
          {t`Metabase can scan the values in this table to enable checkbox filters in dashboards and questions.`}
        </Text>

        <RescanTableFieldsButton tableId={table.id} />

        <DiscardTableFieldValuesButton tableId={table.id} />
      </Stack>
    </Stack>
  );
};
