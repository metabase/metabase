import { t } from "ttag";

import {
  useUpdateTableFieldsOrderMutation,
  useUpdateTableMutation,
} from "metabase/api";
import {
  DiscardTableFieldValuesButton,
  FieldOrderPicker,
  NameDescriptionInput,
  RescanTableFieldsButton,
  SortableFieldList,
} from "metabase/metadata/components";
import { Card, Flex, Stack, Switch, Text } from "metabase/ui";
import type { FieldId, Table } from "metabase-types/api";

import type { RouteParams } from "../../types";
import { getUrl, parseRouteParams } from "../../utils";

interface Props {
  params: RouteParams;
  table: Table;
}

export const TableSection = ({ params, table }: Props) => {
  const { fieldId, ...parsedParams } = parseRouteParams(params);
  const [updateTable] = useUpdateTableMutation();
  const [updateTableFieldsOrder] = useUpdateTableFieldsOrderMutation();

  return (
    <Stack gap="lg">
      <NameDescriptionInput
        description={table.description ?? ""}
        descriptionPlaceholder={t`Give this table a description`}
        name={table.display_name}
        namePlaceholder={t`Give this table a name`}
        onDescriptionChange={(description) => {
          updateTable({ id: table.id, description });
        }}
        onNameChange={(name) => {
          updateTable({ id: table.id, display_name: name });
        }}
      />

      <Stack gap="sm">
        <Text fw="bold" size="sm">{t`Table visibility`}</Text>

        <Card bg="accent-gray-light" p="sm" radius="md" shadow="none">
          <Switch
            checked={table.visibility_type === "hidden"}
            label={t`Hide this table`}
            size="sm"
            onChange={(event) => {
              const visibilityType = event.target.checked ? "hidden" : null;
              updateTable({ id: table.id, visibility_type: visibilityType });
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
            }}
          />
        </Flex>

        <SortableFieldList
          activeFieldId={fieldId}
          getFieldHref={(fieldId) => getUrl({ ...parsedParams, fieldId })}
          table={table}
          onChange={(fieldOrder) => {
            updateTableFieldsOrder({
              id: table.id,
              // in this context field id will never be a string because it's a raw table field, so it's ok to cast
              field_order: fieldOrder as FieldId[],
            });
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
