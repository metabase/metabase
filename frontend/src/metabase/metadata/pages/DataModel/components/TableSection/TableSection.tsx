import { t } from "ttag";

import { useGetTableQuery, useUpdateTableMutation } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper";
import { NameDescriptionInput } from "metabase/metadata/components";
import { Card, Stack, Switch, Text } from "metabase/ui";
import type { TableId } from "metabase-types/api";

interface Props {
  tableId: TableId;
}

export const TableSection = ({ tableId }: Props) => {
  const { data: table, error, isLoading } = useGetTableQuery({ id: tableId });
  const [updateTable] = useUpdateTableMutation();

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
              updateTable({
                id: tableId,
                visibility_type: event.target.checked ? "hidden" : null,
              });
            }}
          />
        </Card>
      </Stack>
    </Stack>
  );
};
