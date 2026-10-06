import { useMemo, useState } from "react";
import { t } from "ttag";

import { DateTime } from "metabase/common/components/DateTime";
import { Link } from "metabase/common/components/Link";
import { ListEmptyState } from "metabase/common/components/ListEmptyState";
import { useGetIcon } from "metabase/hooks/use-icon";
import {
  Card,
  EntityNameCell,
  Icon,
  type RenderRowLink,
  Stack,
  Text,
  TextInput,
  TreeTable,
  type TreeTableColumnDef,
  useTreeTableInstance,
} from "metabase/ui";
import type { Dashboard } from "metabase-types/api";

import { LibraryDashboardPage } from "../components/LibraryDashboardPage";
import {
  type DashboardContentDetails,
  useContentsDetails,
} from "../components/use-contents-details";
import { type DashboardContentItem, getDashboardContents } from "../utils";

type DashboardContentRow = DashboardContentItem & DashboardContentDetails;

const getNodeId = (item: DashboardContentRow) => item.id;
const globalFilterFn = (
  row: { original: DashboardContentRow },
  _columnId: string,
  filterValue: string,
) => row.original.name.toLowerCase().includes(filterValue.toLowerCase());

const renderRowLink: RenderRowLink<DashboardContentRow> = (row, props) => (
  <Link to={row.original.url} {...props} />
);

export function LibraryDashboardContentsPage() {
  return (
    <LibraryDashboardPage data-testid="library-dashboard-contents-page">
      {(dashboard) => <LibraryDashboardContents dashboard={dashboard} />}
    </LibraryDashboardPage>
  );
}

function LibraryDashboardContents({ dashboard }: { dashboard: Dashboard }) {
  const [searchQuery, setSearchQuery] = useState("");
  const getIcon = useGetIcon();
  const contents = useMemo(() => getDashboardContents(dashboard), [dashboard]);
  const detailsById = useContentsDetails(contents);
  const rows = useMemo<DashboardContentRow[]>(
    () => contents.map((item) => ({ ...item, ...detailsById.get(item.id) })),
    [contents, detailsById],
  );
  const hasTabs = (dashboard.tabs?.length ?? 0) > 1;

  const columns = useMemo<TreeTableColumnDef<DashboardContentRow>[]>(() => {
    const tabsColumn: TreeTableColumnDef<DashboardContentRow> = {
      id: "tabs",
      header: t`Tab`,
      accessorFn: (item) => item.tabNames.join(", "),
      enableSorting: true,
      minWidth: 120,
      cell: ({ row }) => (
        <Text c="text-secondary" truncate>
          {row.original.tabNames.join(", ")}
        </Text>
      ),
    };

    return [
      {
        id: "name",
        header: t`Name`,
        accessorKey: "name",
        enableSorting: true,
        minWidth: 200,
        cell: ({ row }) => (
          <EntityNameCell
            icon={
              getIcon({
                model: row.original.model,
                display: row.original.display,
              }).name
            }
            name={row.original.name}
          />
        ),
      },
      {
        id: "type",
        header: t`Type`,
        accessorKey: "typeLabel",
        enableSorting: true,
        width: "auto",
        widthPadding: 20,
        cell: ({ row }) => <Text>{row.original.typeLabel}</Text>,
      },
      {
        id: "location",
        header: t`Location`,
        accessorFn: (item) => item.location?.name ?? "",
        enableSorting: true,
        minWidth: 160,
        cell: ({ row }) =>
          row.original.location ? (
            <EntityNameCell
              icon={row.original.location.icon}
              name={row.original.location.name}
            />
          ) : null,
      },
      ...(hasTabs ? [tabsColumn] : []),
      {
        id: "lastEditedBy",
        header: t`Last edited by`,
        accessorFn: (item) => item.lastEditedBy ?? "",
        enableSorting: true,
        minWidth: 140,
        cell: ({ row }) => <Text truncate>{row.original.lastEditedBy}</Text>,
      },
      {
        id: "lastEditedAt",
        header: t`Last edited at`,
        accessorFn: (item) => item.lastEditedAt ?? "",
        enableSorting: true,
        minWidth: 160,
        cell: ({ row }) =>
          row.original.lastEditedAt ? (
            <DateTime value={row.original.lastEditedAt} />
          ) : null,
      },
    ];
  }, [getIcon, hasTabs]);

  const treeTableInstance = useTreeTableInstance({
    data: rows,
    columns,
    getNodeId,
    globalFilter: searchQuery,
    onGlobalFilterChange: setSearchQuery,
    globalFilterFn,
  });

  const emptyMessage =
    contents.length === 0
      ? t`This dashboard doesn't have any saved questions yet`
      : searchQuery && treeTableInstance.rows.length === 0
        ? t`No results for "${searchQuery}"`
        : null;

  return (
    <Stack gap="lg">
      <TextInput
        placeholder={t`Search...`}
        leftSection={<Icon name="search" />}
        bdrs="sm"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />
      <Card withBorder p={0}>
        <TreeTable
          instance={treeTableInstance}
          emptyState={
            emptyMessage ? <ListEmptyState label={emptyMessage} /> : null
          }
          renderRowLink={renderRowLink}
        />
      </Card>
    </Stack>
  );
}
