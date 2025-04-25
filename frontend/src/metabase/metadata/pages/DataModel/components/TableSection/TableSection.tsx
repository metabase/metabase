import { t } from "ttag";

import {
  useGetTableQueryMetadataQuery,
  useUpdateTableFieldsOrderMutation,
  useUpdateTableMutation,
} from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper";
import {
  FieldOrderPicker,
  NameDescriptionInput,
} from "metabase/metadata/components";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import { Flex, Stack, Text } from "metabase/ui";
import type { FieldId, TableId, UpdateTableRequest } from "metabase-types/api";

import { FieldOrder } from "../FieldOrder";
import { TableVisibilityInput } from "../TableVisibilityInput";

interface Props {
  tableId: TableId;
}

export const TableSection = ({ tableId }: Props) => {
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

  const patchTable = (patch: Omit<UpdateTableRequest, "id">) => {
    updateTable({ id: tableId, ...patch });
  };

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
          patchTable({ description });
        }}
        onNameChange={(name) => {
          patchTable({ display_name: name });
        }}
      />

      <TableVisibilityInput
        checked={table.visibility_type === "hidden"}
        onChange={(event) => {
          const visibilityType = event.target.checked ? "hidden" : null;
          patchTable({ visibility_type: visibilityType });
        }}
      />

      <Stack gap="sm">
        <Flex align="flex-end" gap="md" justify="space-between">
          <Text fw="bold" size="sm">{t`Fields`}</Text>

          <FieldOrderPicker
            value={table.field_order}
            onChange={(fieldOrder) => {
              patchTable({ field_order: fieldOrder });
            }}
          />
        </Flex>

        <FieldOrder
          table={table}
          onChange={(fieldOrder) => {
            updateTableFieldsOrder({
              id: tableId,
              // in this context field id will never be a string because it's a raw table field, so it's ok to cast
              field_order: fieldOrder as FieldId[],
            });
          }}
        />
      </Stack>
    </Stack>
  );
};
