import { useMemo } from "react";
import { t } from "ttag";

import DateTime from "metabase/common/components/DateTime";
import type { TreeTableColumnDef } from "metabase/ui";
import {
  Card,
  EntityNameCell,
  Flex,
  Icon,
  Stack,
  TextInput,
  TreeTable,
  useTreeTableInstance,
} from "metabase/ui";
import { DataStudioBreadcrumbs } from "metabase-enterprise/data-studio/common/components/DataStudioBreadcrumbs";
import { PaneHeader } from "metabase-enterprise/data-studio/common/components/PaneHeader";

import { SectionLayout } from "../../components/SectionLayout";

import type { TreeItem } from "./types";

const STUB_LIBRARY_DATA: TreeItem[] = [
  {
    id: "collection:data",
    name: "Data",
    icon: "folder",
    model: "collection",
    data: {
      id: 1,
      name: "Data",
      model: "collection",
      namespace: null,
    },
    children: [
      {
        id: "table:1",
        name: "Orders",
        icon: "table",
        model: "table",
        updatedAt: "2024-01-15T10:30:00Z",
        data: {
          id: 1,
          name: "Orders",
          model: "table",
        },
      },
      {
        id: "table:2",
        name: "Customers",
        icon: "table",
        model: "table",
        updatedAt: "2024-01-14T14:20:00Z",
        data: {
          id: 2,
          name: "Customers",
          model: "table",
        },
      },
      {
        id: "table:3",
        name: "Products",
        icon: "table",
        model: "table",
        updatedAt: "2024-01-13T09:15:00Z",
        data: {
          id: 3,
          name: "Products",
          model: "table",
        },
      },
    ],
  },
  {
    id: "collection:metrics",
    name: "Metrics",
    icon: "folder",
    model: "collection",
    data: {
      id: 2,
      name: "Metrics",
      model: "collection",
      namespace: null,
    },
    children: [
      {
        id: "metric:1",
        name: "Total Revenue",
        icon: "metric",
        model: "metric",
        updatedAt: "2024-01-16T09:00:00Z",
        data: {
          id: 1,
          name: "Total Revenue",
          model: "metric",
        },
      },
      {
        id: "metric:2",
        name: "Customer Count",
        icon: "metric",
        model: "metric",
        updatedAt: "2024-01-15T16:45:00Z",
        data: {
          id: 2,
          name: "Customer Count",
          model: "metric",
        },
      },
    ],
  },
  {
    id: "collection:snippets",
    name: "Snippets",
    icon: "folder",
    model: "collection",
    data: {
      id: 3,
      name: "Snippets",
      model: "collection",
      namespace: "snippets",
    },
    children: [
      {
        id: "snippet:1",
        name: "Date Filter",
        icon: "snippet",
        model: "snippet",
        updatedAt: "2024-01-12T11:30:00Z",
        data: {
          id: 1,
          name: "Date Filter",
          model: "snippet",
        },
      },
    ],
  },
];

export function LibrarySectionLayoutPreview() {
  const libraryColumnDef = useMemo<TreeTableColumnDef<TreeItem>[]>(
    () => [
      {
        id: "name",
        header: t`Name`,
        enableSorting: true,
        accessorKey: "name",
        cell: ({ row }) => (
          <EntityNameCell
            data-testid={`${row.original.model}-name`}
            icon={row.original.icon}
            name={row.original.name}
          />
        ),
      },
      {
        id: "updatedAt",
        header: t`Updated At`,
        accessorKey: "updatedAt",
        enableSorting: true,
        sortingFn: "datetime",
        width: "auto",
        widthPadding: 20,
        cell: ({ getValue }) => {
          const dateValue = getValue() as string | undefined;
          return dateValue ? <DateTime value={dateValue} /> : null;
        },
      },
      {
        id: "actions",
        width: 48,
        cell: () => null,
      },
    ],
    [],
  );

  const treeTableInstance = useTreeTableInstance({
    data: STUB_LIBRARY_DATA,
    columns: libraryColumnDef,
    getSubRows: (node) => node.children,
    getNodeId: (node) => node.id,
    globalFilter: "",
    onGlobalFilterChange: () => {},
    isFilterable: (node) => node.model !== "collection",
    defaultExpanded: true,
    onRowActivate: () => {},
  });

  return (
    <SectionLayout>
      <PaneHeader
        breadcrumbs={
          <DataStudioBreadcrumbs>{t`Library`}</DataStudioBreadcrumbs>
        }
        px="3.5rem"
        py={0}
      />
      <Stack
        bg="background-light"
        data-testid="library-page-preview"
        pb="2rem"
        px="3.5rem"
        style={{ overflow: "hidden" }}
      >
        <Flex gap="md">
          <TextInput
            placeholder={t`Search...`}
            leftSection={<Icon name="search" />}
            bdrs="md"
            flex="1"
            value=""
            onChange={() => {}}
            disabled
          />
        </Flex>
        <Card withBorder p={0}>
          <TreeTable instance={treeTableInstance} />
        </Card>
      </Stack>
    </SectionLayout>
  );
}
