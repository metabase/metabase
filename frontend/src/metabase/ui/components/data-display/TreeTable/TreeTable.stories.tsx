import { useCallback, useMemo, useState } from "react";

import { Box, Group, Icon, type IconName, Text } from "metabase/ui";

import { TreeTable } from "./TreeTable";
import { useTreeTable } from "./hooks";
import type {
  FlatTreeNode,
  NodeId,
  TreeColumnDef,
  TreeNodeData,
} from "./types";

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

const basicColumns: TreeColumnDef<CollectionItem>[] = [
  {
    id: "name",
    grow: true,
    cell: ({ node }) => (
      <Group gap="xs" wrap="nowrap">
        <Icon name={ITEM_ICONS[node.data.type]} c="brand" />
        {node.data.name}
      </Group>
    ),
  },
];

const detailedColumns: TreeColumnDef<CollectionItem>[] = [
  {
    id: "name",
    header: "Name",
    grow: true,
    cell: ({ node }) => (
      <Group gap="xs" wrap="nowrap">
        <Icon name={ITEM_ICONS[node.data.type]} c="brand" />
        {node.data.name}
      </Group>
    ),
  },
  {
    id: "type",
    header: "Type",
    size: 100,
    cell: ({ node }) => (
      <Text c="text-medium" size="sm" tt="capitalize">
        {node.data.type}
      </Text>
    ),
  },
  {
    id: "owner",
    header: "Owner",
    size: 140,
    cell: ({ node }) =>
      node.data.owner ? (
        <Text c="text-medium" size="sm">
          {node.data.owner}
        </Text>
      ) : null,
  },
  {
    id: "lastEdited",
    header: "Last edited",
    size: 120,
    cell: ({ node }) =>
      node.data.lastEdited ? (
        <Text c="text-medium" size="sm">
          {node.data.lastEdited}
        </Text>
      ) : null,
  },
];

export const Default = {
  render: function DefaultStory() {
    const instance = useTreeTable({
      data: mockData,
      columns: basicColumns,
      getChildren: (node) => node.children,
      getNodeId: (node) => node.id,
    });

    return (
      <Box h={400}>
        <TreeTable
          instance={instance}
          onRowClick={(node) => {
            if (node.hasChildren) {
              instance.expansion.toggle(node.id);
            }
          }}
        />
      </Box>
    );
  },
};

export const WithMultipleColumns = {
  render: function WithMultipleColumnsStory() {
    const instance = useTreeTable({
      data: mockData,
      columns: detailedColumns,
      getChildren: (node) => node.children,
      getNodeId: (node) => node.id,
    });

    return (
      <Box h={400}>
        <TreeTable
          instance={instance}
          showHeader
          onRowClick={(node) => {
            if (node.hasChildren) {
              instance.expansion.toggle(node.id);
            }
          }}
        />
      </Box>
    );
  },
};

export const WithCheckboxes = {
  render: function WithCheckboxesStory() {
    const instance = useTreeTable({
      data: mockData,
      columns: detailedColumns,
      getChildren: (node) => node.children,
      getNodeId: (node) => node.id,
      selectionMode: "multi",
    });

    return (
      <Box h={400}>
        <TreeTable
          instance={instance}
          showHeader
          showCheckboxes
          onRowClick={(node) => {
            if (node.hasChildren) {
              instance.expansion.toggle(node.id);
            }
          }}
        />
      </Box>
    );
  },
};

export const MultiSelection = {
  render: function MultiSelectionStory() {
    const instance = useTreeTable({
      data: mockData,
      columns: detailedColumns,
      getChildren: (node) => node.children,
      getNodeId: (node) => node.id,
      selectionMode: "multi",
      enableRangeSelection: true,
    });

    return (
      <Box h={400}>
        <TreeTable
          instance={instance}
          showHeader
          showCheckboxes
          onRowClick={(node) => {
            if (node.hasChildren) {
              instance.expansion.toggle(node.id);
            }
          }}
        />
      </Box>
    );
  },
};

interface DatabaseItem extends TreeNodeData {
  id: string;
  name: string;
  type: "database" | "schema" | "table";
  children?: DatabaseItem[];
}

const initialLazyData: DatabaseItem[] = [
  {
    id: "db-1",
    name: "Production Database",
    type: "database",
    children: [],
  },
  {
    id: "db-2",
    name: "Staging Database",
    type: "database",
    children: [],
  },
  {
    id: "db-3",
    name: "Analytics Warehouse",
    type: "database",
    children: [],
  },
];

const simulatedChildren: Record<string, DatabaseItem[]> = {
  "db-1": [
    {
      id: "db-1-schema-1",
      name: "public",
      type: "schema",
      children: [
        { id: "db-1-t-1", name: "users", type: "table" },
        { id: "db-1-t-2", name: "orders", type: "table" },
        { id: "db-1-t-3", name: "products", type: "table" },
      ],
    },
    {
      id: "db-1-schema-2",
      name: "analytics",
      type: "schema",
      children: [
        { id: "db-1-t-4", name: "events", type: "table" },
        { id: "db-1-t-5", name: "sessions", type: "table" },
      ],
    },
  ],
  "db-2": [
    {
      id: "db-2-schema-1",
      name: "public",
      type: "schema",
      children: [
        { id: "db-2-t-1", name: "users_staging", type: "table" },
        { id: "db-2-t-2", name: "orders_staging", type: "table" },
      ],
    },
  ],
  "db-3": [
    {
      id: "db-3-schema-1",
      name: "reports",
      type: "schema",
      children: [
        { id: "db-3-t-1", name: "daily_summary", type: "table" },
        { id: "db-3-t-2", name: "monthly_revenue", type: "table" },
      ],
    },
  ],
};

function updateNodeChildren(
  nodes: DatabaseItem[],
  nodeId: NodeId,
  newChildren: DatabaseItem[],
): DatabaseItem[] {
  return nodes.map((node) => {
    if (node.id === nodeId) {
      return { ...node, children: newChildren };
    }
    if (node.children && node.children.length > 0) {
      return {
        ...node,
        children: updateNodeChildren(node.children, nodeId, newChildren),
      };
    }
    return node;
  });
}

export const LazyLoadingChildren = {
  render: function LazyLoadingChildrenStory() {
    const [data, setData] = useState<DatabaseItem[]>(initialLazyData);
    const [loadingIds, setLoadingIds] = useState<Set<NodeId>>(new Set());

    const columns: TreeColumnDef<DatabaseItem>[] = useMemo(
      () => [
        {
          id: "name",
          header: "Data",
          grow: true,
          cell: ({ node }) => (
            <Group gap="xs" wrap="nowrap">
              <Icon name={ITEM_ICONS[node.data.type]} c="brand" />
              {node.data.name}
            </Group>
          ),
        },
      ],
      [],
    );

    const hasUnloadedChildren = useCallback(
      (node: DatabaseItem) =>
        node.type !== "table" &&
        (!node.children || node.children.length === 0) &&
        simulatedChildren[node.id] !== undefined,
      [],
    );

    const onLoadChildren = useCallback(async (node: DatabaseItem) => {
      setLoadingIds((prev) => new Set(prev).add(node.id));

      await new Promise((resolve) => setTimeout(resolve, 1500));

      const children = simulatedChildren[node.id] ?? [];
      setData((prev) => updateNodeChildren(prev, node.id, children));

      setLoadingIds((prev) => {
        const next = new Set(prev);
        next.delete(node.id);
        return next;
      });

      return children;
    }, []);

    const instance = useTreeTable({
      data,
      columns,
      getChildren: (node) => node.children,
      getNodeId: (node) => node.id,
      hasUnloadedChildren,
      onLoadChildren,
      loadingIds,
    });

    const isChildrenLoading = useCallback(
      (node: FlatTreeNode<DatabaseItem>) => loadingIds.has(node.id),
      [loadingIds],
    );

    return (
      <Box h={400}>
        <TreeTable
          instance={instance}
          showHeader
          isChildrenLoading={isChildrenLoading}
          onRowClick={(node) => {
            if (node.hasChildren) {
              instance.expansion.toggle(node.id);
            }
          }}
        />
      </Box>
    );
  },
};

export const EmptyState = {
  render: function EmptyStateStory() {
    const instance = useTreeTable({
      data: [] as CollectionItem[],
      columns: basicColumns,
      getChildren: (node) => node.children,
      getNodeId: (node) => node.id,
    });

    return (
      <Box h={400}>
        <TreeTable
          instance={instance}
          emptyState={
            <Box ta="center" py="xl">
              <Icon name="folder" size={48} c="text-light" />
              <Text c="text-medium" mt="md">
                This collection is empty
              </Text>
            </Box>
          }
        />
      </Box>
    );
  },
};

const dataWithDisabled: CollectionItem[] = [
  {
    id: "1",
    name: "Public Reports",
    type: "collection",
    children: [
      {
        id: "1-1",
        name: "Weekly Summary",
        type: "dashboard",
        owner: "Alice Chen",
      },
      {
        id: "1-2",
        name: "User Growth",
        type: "question",
        owner: "Bob Smith",
      },
    ],
  },
  {
    id: "2",
    name: "Restricted Analytics",
    type: "collection",
    children: [
      {
        id: "2-1",
        name: "Revenue Model",
        type: "model",
        owner: "Admin",
      },
    ],
  },
  {
    id: "3",
    name: "Team Dashboards",
    type: "collection",
    children: [
      {
        id: "3-1",
        name: "Engineering KPIs",
        type: "dashboard",
        owner: "Carol Davis",
      },
    ],
  },
];

export const WithDisabledRows = {
  render: function WithDisabledRowsStory() {
    const instance = useTreeTable({
      data: dataWithDisabled,
      columns: detailedColumns,
      getChildren: (node) => node.children,
      getNodeId: (node) => node.id,
      isDisabled: (node) => node.id === "2" || node.id.startsWith("2-"),
      selectionMode: "multi",
    });

    return (
      <Box h={400}>
        <TreeTable
          instance={instance}
          showHeader
          showCheckboxes
          onRowClick={(node) => {
            if (node.hasChildren && !node.isDisabled) {
              instance.expansion.toggle(node.id);
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
    const largeData = useMemo(() => generateLargeDataset(100), []);

    const instance = useTreeTable({
      data: largeData,
      columns: detailedColumns,
      getChildren: (node) => node.children,
      getNodeId: (node) => node.id,
    });

    return (
      <Box h={500}>
        <TreeTable
          instance={instance}
          showHeader
          onRowClick={(node) => {
            if (node.hasChildren) {
              instance.expansion.toggle(node.id);
            }
          }}
        />
      </Box>
    );
  },
};
