import { useGetTableQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper";
import { Box } from "metabase/ui";
import type { TableId } from "metabase-types/api";

interface Props {
  tableId: TableId;
}

export const TableSection = ({ tableId }: Props) => {
  const { data: table, error, isLoading } = useGetTableQuery({ id: tableId });

  if (error || isLoading || !table) {
    return <LoadingAndErrorWrapper error={error} loading={isLoading} />;
  }

  return <Box>{table.name}</Box>;
};
