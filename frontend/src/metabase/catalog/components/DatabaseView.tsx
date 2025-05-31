import { t } from "ttag";
import { withRouter } from "react-router";
import _ from "underscore";
import * as React from "react";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from "@tanstack/react-table";

import { useGetDatabaseQuery } from "metabase/api";
import { Box, Text, Title } from "metabase/ui";
import CatalogSidebar from "./CatalogSidebar";
import type { Database, Table } from "metabase-types/api";

interface RouterProps {
  router: {
    params: {
      databaseId: string;
    };
    push: (path: string) => void;
  };
}

const DatabaseView = ({ router }: RouterProps) => {
  const { databaseId } = router.params;
  const { data: database, isLoading, error } = useGetDatabaseQuery(
    { id: parseInt(databaseId), include: "tables" },
    { skip: !databaseId }
  );

  const columnHelper = React.useMemo(
    () => createColumnHelper<Table>(),
    []
  );

  const columns = React.useMemo(
    () => [
      columnHelper.accessor("name", {
        header: t`Table name`,
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
      columnHelper.accessor("schema", {
        header: t`Schema`,
        cell: info => <Text>{info.getValue() || "public"}</Text>,
      }),
      columnHelper.accessor("type", {
        header: t`Type`,
        cell: info => <Text>{info.getValue() || t`Table`}</Text>,
      }),
    ],
    [columnHelper]
  );

  const tableInstance = useReactTable({
    data: database?.tables || [],
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

  if (error || !database) {
    return (
      <Box display="flex" h="100%">
        <CatalogSidebar />
        <Box p="xl" flex="1">
          <Text c="error">{t`Database not found`}</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box display="flex" h="100%">
      <CatalogSidebar />
      <Box p="xl" flex="1">
        <Title order={1} mb="lg">{database.name}</Title>
        {database.caveats && (
          <Text c="text-medium" mb="xl">{database.caveats}</Text>
        )}

        <Box mb="md">
          <Title order={2}>{t`Tables`}</Title>
        </Box>

        <Box>
          <table style={{ width: "100%" }}>
            <thead>
              {tableInstance.getHeaderGroups().map(headerGroup => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map(header => (
                    <th
                      key={header.id}
                      style={{
                        textAlign: "left",
                        padding: "0.5rem",
                        borderBottom: "1px solid var(--mb-color-border)",
                      }}
                    >
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {tableInstance.getRowModel().rows.map(row => (
                <tr
                  key={row.id}
                  onClick={() => {
                    const schemaName = row.original.schema || "public";
                    router.push(`/catalog/databases/${databaseId}/schemas/${schemaName}/tables/${row.original.id}`);
                  }}
                  style={{
                    cursor: "pointer",
                    backgroundColor: "transparent",
                    transition: "background-color 0.2s ease",
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.backgroundColor = "var(--mb-color-bg-light)";
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.backgroundColor = "transparent";
                  }}
                >
                  {row.getVisibleCells().map(cell => (
                    <td
                      key={cell.id}
                      style={{
                        padding: "0.75rem 0.5rem",
                        borderBottom: "1px solid var(--mb-color-border)",
                      }}
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
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

export default withRouter(DatabaseView); 