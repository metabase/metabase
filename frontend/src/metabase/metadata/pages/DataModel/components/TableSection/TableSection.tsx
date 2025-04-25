import { t } from "ttag";

import { useGetTableQuery, useUpdateTableMutation } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper";
import {
  FieldOrderPicker,
  NameDescriptionInput,
} from "metabase/metadata/components";
import { Card, Flex, Stack, Text } from "metabase/ui";
import type { TableId, UpdateTableRequest } from "metabase-types/api";

import { TableVisibilityInput } from "../TableVisibilityInput";

interface Props {
  tableId: TableId;
}

export const TableSection = ({ tableId }: Props) => {
  const { data: table, error, isLoading } = useGetTableQuery({ id: tableId });
  const [updateTable] = useUpdateTableMutation();

  const update = (patch: Omit<UpdateTableRequest, "id">) => {
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
          update({ description });
        }}
        onNameChange={(name) => {
          update({ display_name: name });
        }}
      />

      <Stack gap="sm">
        <Text fw="bold" size="sm">{t`Table visibility`}</Text>

        <Card bg="accent-gray-light" p="sm" radius="md" shadow="none">
          <TableVisibilityInput
            checked={table.visibility_type === "hidden"}
            onChange={(event) => {
              const visibilityType = event.target.checked ? "hidden" : null;
              update({ visibility_type: visibilityType });
            }}
          />
        </Card>
      </Stack>

      <Stack gap="sm">
        <Flex align="flex-end" justify="space-between">
          <Text fw="bold" size="sm">{t`Fields`}</Text>

          <FieldOrderPicker
            comboboxProps={{
              position: "bottom-end",
            }}
            value={table.field_order}
            onChange={(fieldOrder) => {
              update({ field_order: fieldOrder });
            }}
          />
        </Flex>
      </Stack>
    </Stack>
  );
};
