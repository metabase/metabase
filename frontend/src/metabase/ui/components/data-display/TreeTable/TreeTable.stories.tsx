import { useMemo } from "react";

import { Box, Icon, type IconName, Text } from "metabase/ui";

import { EntityNameCell } from "./EntityNameCell";
import { TreeTable } from "./TreeTable";
import { useTreeTableInstance } from "./hooks";
import type { TreeNodeData, TreeTableColumnDef } from "./types";

export default {
  title: "Components/Data display/TreeTable",
  component: TreeTable,
};

type ItemType =
  | "collection"
  | "question"
  | "model"
  | "dashboard"
  | "metric"
  | "database"
  | "schema"
  | "table";

interface CollectionItem extends TreeNodeData {
  id: string;
  name: string;
  type: ItemType;
  owner?: string;
  lastEdited?: string;
  children?: CollectionItem[];
}

const ITEM_ICONS: Record<ItemType, IconName> = {
  collection: "folder",
  question: "table2",
  model: "model",
  dashboard: "dashboard",
  metric: "metric",
  database: "database",
  schema: "folder",
  table: "table2",
};

const mockData: CollectionItem[] = [
  {
    id: "1",
    name: "Marketing",
    type: "collection",
    children: [
      {
        id: "1-1",
        name: "Campaign Reports",
        type: "collection",
        children: [
          {
            id: "1-1-1",
            name: "Q4 Campaign Performance",
            type: "dashboard",
            owner: "Alice Chen",
            lastEdited: "2024-01-15",
          },
          {
            id: "1-1-2",
            name: "Email Open Rates",
            type: "question",
            owner: "Bob Smith",
            lastEdited: "2024-01-10",
          },
        ],
      },
      {
        id: "1-2",
        name: "Website Traffic",
        type: "question",
        owner: "Carol Davis",
        lastEdited: "2024-01-20",
      },
    ],
  },
  {
    id: "2",
    name: "Sales",
    type: "collection",
    children: [
      {
        id: "2-1",
        name: "Revenue by Region",
        type: "model",
        owner: "Dan Wilson",
        lastEdited: "2024-01-18",
      },
      {
        id: "2-2",
        name: "Monthly Targets",
        type: "dashboard",
        owner: "Eve Johnson",
        lastEdited: "2024-01-19",
      },
      {
        id: "2-3",
        name: "Customer LTV",
        type: "metric",
        owner: "Frank Lee",
        lastEdited: "2024-01-17",
      },
    ],
  },
  {
    id: "3",
    name: "Active Users Overview",
    type: "dashboard",
    owner: "Grace Kim",
    lastEdited: "2024-01-01",
  },
];

const detailedColumns: TreeTableColumnDef<CollectionItem>[] = [
  {
    id: "name",
    header: "Name",
    cell: ({ row }) => (
      <EntityNameCell
        icon={ITEM_ICONS[row.original.type]}
        name={row.original.name}
      />
    ),
  },
  {
    id: "type",
    header: "Type",
    width: 100,
    cell: ({ row }) => (
      <Text c="text-secondary" size="sm" tt="capitalize">
        {row.original.type}
      </Text>
    ),
  },
  {
    id: "owner",
    header: "Owner",
    width: 140,
    cell: ({ row }) =>
      row.original.owner ? (
        <Text c="text-secondary" size="sm">
          {row.original.owner}
        </Text>
      ) : null,
  },
  {
    id: "lastEdited",
    header: "Last edited",
    width: 120,
    cell: ({ row }) =>
      row.original.lastEdited ? (
        <Text c="text-secondary" size="sm">
          {row.original.lastEdited}
        </Text>
      ) : null,
  },
];

export const WithColumnsAndSelection = {
  render: function WithColumnsAndSelectionStory() {
    const instance = useTreeTableInstance({
      data: mockData,
      columns: detailedColumns,
      getSubRows: (node) => node.children,
      getNodeId: (node) => node.id,
      enableRowSelection: true,
      enableMultiRowSelection: true,
    });

    return (
      <Box h={400}>
        <TreeTable
          instance={instance}
          showCheckboxes
          onRowClick={(row) => {
            if (row.getCanExpand()) {
              row.toggleExpanded();
            }
          }}
        />
      </Box>
    );
  },
};

const itemTypes: ItemType[] = ["question", "dashboard", "model", "metric"];
const owners = [
  "Alice Chen",
  "Bob Smith",
  "Carol Davis",
  "Dan Wilson",
  "Eve Johnson",
];

function generateLargeDataset(count: number): CollectionItem[] {
  const collections: CollectionItem[] = [];
  for (let i = 0; i < count; i++) {
    const collectionId = `collection-${i}`;
    collections.push({
      id: collectionId,
      name: `Project ${i + 1}`,
      type: "collection",
      children: Array.from({ length: 5 }, (_, j) => ({
        id: `${collectionId}-item-${j}`,
        name: `${["Weekly Report", "User Analysis", "Revenue Model", "Growth Metrics", "Performance Dashboard"][j]} ${i + 1}`,
        type: itemTypes[j % itemTypes.length],
        owner: owners[j % owners.length],
        lastEdited: `2024-01-${String((i % 28) + 1).padStart(2, "0")}`,
      })),
    });
  }
  return collections;
}

export const LargeDataset = {
  render: function LargeDatasetStory() {
    const largeData = useMemo(() => generateLargeDataset(200), []);

    const instance = useTreeTableInstance({
      data: largeData,
      columns: detailedColumns,
      getSubRows: (node) => node.children,
      getNodeId: (node) => node.id,
      defaultExpanded: true,
    });

    return (
      <Box h={500}>
        <TreeTable
          instance={instance}
          onRowClick={(row) => {
            if (row.getCanExpand()) {
              row.toggleExpanded();
            }
          }}
        />
      </Box>
    );
  },
};

export const EmptyState = {
  render: function EmptyStateStory() {
    const instance = useTreeTableInstance({
      data: [] as CollectionItem[],
      columns: detailedColumns,
      getSubRows: (node) => node.children,
      getNodeId: (node) => node.id,
    });

    return (
      <Box h={400}>
        <TreeTable
          instance={instance}
          emptyState={
            <Box ta="center" py="xl">
              <Icon name="folder" size={48} c="text-tertiary" />
              <Text c="text-secondary" mt="md">
                This collection is empty
              </Text>
            </Box>
          }
        />
      </Box>
    );
  },
};
