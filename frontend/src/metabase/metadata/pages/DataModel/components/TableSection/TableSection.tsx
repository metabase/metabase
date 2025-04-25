import { t } from "ttag";

import { useGetTableQuery, useUpdateTableMutation } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper";
import {
  FieldOrderPicker,
  NameDescriptionInput,
} from "metabase/metadata/components";
import { Flex, Stack, Text } from "metabase/ui";
import type { TableId, UpdateTableRequest } from "metabase-types/api";

import { TableVisibilityInput } from "../TableVisibilityInput";

interface Props {
  tableId: TableId;
}

export const TableSection = ({ tableId }: Props) => {
  const { data: table, error, isLoading } = useGetTableQuery({ id: tableId });
  const [updateTable] = useUpdateTableMutation();

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
        <Flex align="flex-end" justify="space-between">
          <Text fw="bold" size="sm">{t`Fields`}</Text>

          <FieldOrderPicker
            comboboxProps={{
              position: "bottom-end",
            }}
            value={table.field_order}
            onChange={(fieldOrder) => {
              patchTable({ field_order: fieldOrder });
            }}
          />
        </Flex>
      </Stack>
    </Stack>
  );
};
