import { useMemo } from "react";

import { useListDatabasesQuery, useListTablesQuery } from "metabase/api";
import { Select } from "metabase/ui";
import type { Table } from "metabase-types/api";

type Props = {
  value?: string;
  onChange: (value: string) => void;
};

export function SelectTable({ value, onChange }: Props) {
  const { data: databases } = useListDatabasesQuery();
  const { data: tables } = useListTablesQuery();

  const data = useMemo(() => {
    const tablesByDatabase: Record<string, Table[]> = {};

    if (tables && databases) {
      for (const table of tables) {
        const database = databases.data.find((db) => db.id === table.db_id);

        if (database) {
          if (!tablesByDatabase[database.name]) {
            tablesByDatabase[database.name] = [];
          }

          tablesByDatabase[database.name].push(table);
        }
      }
    }

    return Object.entries(tablesByDatabase).map(([databaseName, tables]) => ({
      group: databaseName,
      items: tables.map((table) => ({
        label: table.display_name,
        value: table.id.toString(),
      })),
    }));
  }, [tables, databases]);

  return (
    <Select
      label="Table"
      data={data}
      searchable
      placeholder="Select a table"
      value={value}
      onChange={onChange}
    />
  );
}
