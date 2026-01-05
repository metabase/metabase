import type { ColumnDef } from "@tanstack/react-table";
import type { ReactNode } from "react";

import { Card, Group, Icon, ThemeProvider } from "metabase/ui";

import { Table } from "..";

import data from "./data.json";

const columns: ColumnDef<Record<string, any>, ReactNode>[] = [
  {
    accessorKey: "name",
    header: "Name",
    meta: { width: "auto" },
    cell: ({ getValue, row }) => {
      const data = row.original;
      return (
        <Group data-testid={`${data.model}-name`} gap="sm">
          {data.icon && <Icon name={data.icon} c="brand" />}
          {getValue()}
        </Group>
      );
    },
  },
  {
    accessorKey: "updatedAt",
    header: "Updated At",
  },
];

const Template = () => {
  return (
    <ThemeProvider>
      <Card p={0} withBorder h={600} w={600}>
        <Table data={data} columns={columns} onSelect={() => {}} />
      </Card>
    </ThemeProvider>
  );
};

export default {
  title: "Components/Table",
  component: Table,
};

export const Default = {
  render: Template,
};
