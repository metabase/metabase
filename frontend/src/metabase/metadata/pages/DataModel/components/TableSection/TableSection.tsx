import { useGetTableQuery, useUpdateTableMutation } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper";
import { Box } from "metabase/ui";
import type { TableId } from "metabase-types/api";

import { NameDescriptionInput } from "../NameDescriptionInput";

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
    <Box>
      <NameDescriptionInput
        description={table.description ?? ""}
        name={table.display_name}
        onDescriptionChange={(description) => {
          updateTable({ id: tableId, description });
        }}
        onNameChange={(name) => {
          updateTable({ id: tableId, display_name: name });
        }}
      />
    </Box>
  );
};
