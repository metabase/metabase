import { t } from "ttag";
import { withRouter } from "react-router";
import * as React from "react";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from "@tanstack/react-table";

import { useGetTableQueryMetadataQuery } from "metabase/api";
import { Box, Text, Title, Button, Group } from "metabase/ui";
import CatalogSidebar from "./CatalogSidebar";
import type { Table } from "metabase-types/api";
import { getIconForField } from "metabase-lib/v1/metadata/utils/fields";

interface RouterProps {
  router: {
    params: {
      databaseId: string;
      schemaId: string;
      tableId: string;
    };
  };
}

const TableView = ({ router }: RouterProps) => {
  const { databaseId, schemaId, tableId } = router.params;
  const { data: table, isLoading, error } = useGetTableQueryMetadataQuery(
    { id: parseInt(tableId) },
    { skip: !tableId }
  );

  const columnHelper = React.useMemo(
    () =>
      createColumnHelper<{
        id: number;
        name: string;
        description: string | null;
        semantic_type: string | null;
        base_type: string;
      }>(),
    []
  );

  const columns = React.useMemo(
    () => [
      columnHelper.accessor("name", {
        header: t`Field name`,
        cell: info => (
          <Box>
            <Text fw="bold">{info.getValue()}</Text>
            {info.row.original.description && (
              <Text c="text-medium" size="sm">
                {info.row.original.description}
              </Text>
            )}
          </Box>
        ),
      }),
      columnHelper.accessor("semantic_type", {
        header: t`Field type`,
        cell: info => <Text>{info.getValue() || t`No semantic type`}</Text>,
      }),
      columnHelper.accessor("base_type", {
        header: t`Data type`,
        cell: info => <Text>{info.getValue()}</Text>,
      }),
    ],
    [columnHelper]
  );

  const fieldList = React.useMemo(() => {
    if (!table?.fields) return [];
    return Object.values(table.fields).sort((a, b) => a.position - b.position);
  }, [table?.fields]);

  const data = React.useMemo(
    () =>
      fieldList.map(field => ({
        id: Number(field.id),
        name: field.display_name || field.name,
        description: field.description,
        semantic_type: field.semantic_type,
        base_type: field.base_type,
      })),
    [fieldList]
  );

  const tableInstance = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  if (isLoading) {
    return (
      <Box display="flex" h="100%">
        <CatalogSidebar />
        <Box p="xl" flex="1">
          <Text>{t`Loading...`}</Text>
        </Box>
      </Box>
    );
  }

  if (error || !table) {
    return (
      <Box display="flex" h="100%">
        <CatalogSidebar />
        <Box p="xl" flex="1">
          <Text c="error">{t`Table not found`}</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box display="flex" h="100%">
      <CatalogSidebar />
      <Box p="xl" flex="1">
        <Group justify="space-between" mb="lg">
          <Title order={1}>{table.name}</Title>
          <Group>
            <Button
              variant="filled"
              onClick={() => {
                const questionData = {
                  dataset_query: {
                    database: parseInt(databaseId),
                    query: {
                      "source-table": parseInt(tableId),
                    },
                    type: "query",
                  },
                  display: "table",
                  visualization_settings: {},
                };
                const encodedData = btoa(JSON.stringify(questionData));
                window.location.href = `/question#${encodedData}`;
              }}
            >
              {t`Explore`}
            </Button>
            <Button
              variant="filled"
              onClick={() => {
                window.location.href = `/admin/datamodel/database/${databaseId}/schema/${schemaId}/table/${tableId}`;
              }}
            >
              {t`Edit metadata`}
            </Button>
          </Group>
        </Group>
        {table.description && (
          <Text c="text-medium" mb="xl">{table.description}</Text>
        )}

        <Box mb="md">
          <Title order={2}>{t`Fields`}</Title>
        </Box>

        <Box className="bordered rounded">
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              {tableInstance.getHeaderGroups().map(headerGroup => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map(header => (
                    <th
                      key={header.id}
                      style={{
                        padding: "0.75rem",
                        textAlign: "left",
                        borderBottom: "1px solid var(--mb-color-border)",
                        backgroundColor: "var(--mb-color-bg-light)",
                      }}
                    >
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {tableInstance.getRowModel().rows.map(row => (
                <tr key={row.id}>
                  {row.getVisibleCells().map(cell => (
                    <td
                      key={cell.id}
                      style={{
                        padding: "0.75rem",
                        borderBottom: "1px solid var(--mb-color-border)",
                      }}
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Box>
      </Box>
    </Box>
  );
};

export default withRouter(TableView); 