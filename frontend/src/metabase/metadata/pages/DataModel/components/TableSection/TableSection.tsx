import { push } from "react-router-redux";
import { t } from "ttag";

import {
  useGetTableQueryMetadataQuery,
  useUpdateTableFieldsOrderMutation,
  useUpdateTableMutation,
} from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper";
import { useDispatch } from "metabase/lib/redux";
import {
  DiscardTableFieldValuesButton,
  FieldOrderPicker,
  NameDescriptionInput,
  RescanTableFieldsButton,
  SortableFieldList,
} from "metabase/metadata/components";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import { Card, Flex, Stack, Switch, Text } from "metabase/ui";
import type { FieldId, TableId } from "metabase-types/api";

import type { RouteParams } from "../../types";
import { getUrl, parseRouteParams } from "../../utils";

interface Props {
  params: RouteParams;
  tableId: TableId;
}

export const TableSection = ({ params, tableId }: Props) => {
  const dispatch = useDispatch();
  const {
    data: table,
    error,
    isLoading,
  } = useGetTableQueryMetadataQuery({
    id: tableId,
    include_sensitive_fields: true,
    ...PLUGIN_FEATURE_LEVEL_PERMISSIONS.dataModelQueryProps,
  });
  const [updateTable] = useUpdateTableMutation();
  const [updateTableFieldsOrder] = useUpdateTableFieldsOrderMutation();

  if (error || isLoading || !table) {
    return <LoadingAndErrorWrapper error={error} loading={isLoading} />;
  }

  return (
    <Stack gap="lg">
      <NameDescriptionInput
        description={table.description ?? ""}
        descriptionPlaceholder={t`Give this table a description`}
        name={table.display_name}
        namePlaceholder={t`Give this table a name`}
        onDescriptionChange={(description) => {
          updateTable({ id: tableId, description });
        }}
        onNameChange={(name) => {
          updateTable({ id: tableId, display_name: name });
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
              updateTable({ id: tableId, visibility_type: visibilityType });
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
              updateTable({ id: tableId, field_order: fieldOrder });
            }}
          />
        </Flex>

        <SortableFieldList
          table={table}
          onChange={(fieldOrder) => {
            updateTableFieldsOrder({
              id: tableId,
              // in this context field id will never be a string because it's a raw table field, so it's ok to cast
              field_order: fieldOrder as FieldId[],
            });
          }}
          onFieldClick={(fieldId) => {
            dispatch(push(getUrl({ ...parseRouteParams(params), fieldId })));
          }}
        />
      </Stack>

      <Stack gap="sm">
        <Text c="text-secondary" mb="md" mt="lg" size="sm" ta="center">
          {/* eslint-disable-next-line no-literal-metabase-strings -- Admin settings */}
          {t`Metabase can scan the values in this table to enable checkbox filters in dashboards and questions.`}
        </Text>

        <RescanTableFieldsButton tableId={tableId} />

        <DiscardTableFieldValuesButton tableId={tableId} />
      </Stack>
    </Stack>
  );
};
