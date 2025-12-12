import type { IconName, TreeColumnDef } from "metabase/ui";
import { Card, Group, Icon, ThemeProvider } from "metabase/ui";

import { Table } from "..";

import data from "./data.json";

interface StoryTreeItem {
  id: number | string;
  name: string;
  icon?: string;
  model?: string;
  updatedAt?: string;
  children?: StoryTreeItem[];
}

const columns: TreeColumnDef<StoryTreeItem>[] = [
  {
    id: "name",
    header: "Name",
    grow: true,
    enableSorting: true,
    accessorKey: "name",
    cell: ({ node }) => (
      <Group data-testid={`${node.data.model}-name`} gap="sm">
        {node.data.icon && <Icon name={node.data.icon as IconName} c="brand" />}
        {node.data.name}
      </Group>
    ),
  },
  {
    id: "updatedAt",
    header: "Updated At",
    accessorKey: "updatedAt",
    enableSorting: true,
    sortingFn: "datetime",
    minSize: 120,
  },
];

const Template = () => {
  return (
    <ThemeProvider>
      <Card p={0} withBorder h={600} w={600}>
        <Table
          data={data as StoryTreeItem[]}
          columns={columns}
          onSelect={() => {}}
        />
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
