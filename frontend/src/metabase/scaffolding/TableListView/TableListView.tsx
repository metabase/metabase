import { useMemo } from "react";

import {
  skipToken,
  useGetAdhocQueryQuery,
  useGetTableQueryMetadataQuery,
} from "metabase/api";
import { Card, Stack } from "metabase/ui";
import type { StructuredDatasetQuery } from "metabase-types/api";

interface RouteParams {
  id: string;
}

interface Props {
  params: RouteParams;
}

export const TableListView = ({ params }: Props) => {
  const tableId = parseInt(params.id, 10);
  const { data: table } = useGetTableQueryMetadataQuery({ id: tableId });

  const query = useMemo<StructuredDatasetQuery | undefined>(() => {
    if (!table) {
      return undefined;
    }

    return {
      database: table.db_id,
      query: {
        "source-table": table.id,
      },
      type: "query",
    };
  }, [table]);

  const { data: dataset } = useGetAdhocQueryQuery(query ? query : skipToken);

  return (
    <Stack component="ul" gap="md" p="xl">
      {dataset?.data.rows.map((row, index) => {
        // dataset.data.cols;

        return (
          <Card component="li" key={index}>
            {row[0]}
          </Card>
        );
      })}
    </Stack>
  );

  return null;
};
