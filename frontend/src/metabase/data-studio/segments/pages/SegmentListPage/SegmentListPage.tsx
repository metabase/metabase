import type { Row } from "@tanstack/react-table";
import { useCallback, useMemo, useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useListSegmentsQuery } from "metabase/api";
import { ListEmptyState } from "metabase/common/components/ListEmptyState";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import {
  EntityPickerModal,
  type OmniPickerItem,
} from "metabase/common/components/Pickers";
import CS from "metabase/css/core/index.css";
import { DataStudioBreadcrumbs } from "metabase/data-studio/common/components/DataStudioBreadcrumbs";
import { PageContainer } from "metabase/data-studio/common/components/PageContainer";
import { PaneHeader } from "metabase/data-studio/common/components/PaneHeader";
import {
  Button,
  Card,
  Ellipsified,
  EntityNameCell,
  Flex,
  Icon,
  Stack,
  TextInput,
  TreeTable,
  type TreeTableColumnDef,
  TreeTableSkeleton,
  useTreeTableInstance,
} from "metabase/ui";
import { useDispatch } from "metabase/utils/redux";
import * as Urls from "metabase/utils/urls";
import type { Segment } from "metabase-types/api";

const EMPTY_SEGMENTS: Segment[] = [];
const getNodeId = (segment: Segment) => String(segment.id);
const getSubRows = () => undefined;

const globalFilterFn = (
  row: { original: Segment },
  _columnId: string,
  filterValue: string,
) => {
  const query = String(filterValue).toLowerCase();
  return row.original.name.toLowerCase().includes(query);
};

export function SegmentListPage() {
  const dispatch = useDispatch();
  const [searchQuery, setSearchQuery] = useState("");
  const [isTablePickerOpen, setIsTablePickerOpen] = useState(false);

  const { data: segments, error, isLoading } = useListSegmentsQuery();

  const columnDefs = useMemo<TreeTableColumnDef<Segment>[]>(
    () => [
      {
        id: "name",
        accessorKey: "name",
        header: t`Name`,
        minWidth: 280,
        maxAutoWidth: 800,
        enableSorting: true,
        cell: ({ row }) => (
          <EntityNameCell
            icon="segment"
            iconColor="brand"
            name={row.original.name}
          />
        ),
      },
      {
        id: "definition_description",
        accessorKey: "definition_description",
        header: t`Definition`,
        minWidth: 200,
        maxAutoWidth: 600,
        enableSorting: true,
        cell: ({ row }) =>
          row.original.definition_description ? (
            <Ellipsified>{row.original.definition_description}</Ellipsified>
          ) : null,
      },
      {
        id: "table",
        accessorFn: (segment) => segment.table?.display_name ?? "",
        header: t`Table`,
        minWidth: 160,
        enableSorting: true,
        cell: ({ row }) =>
          row.original.table?.display_name ? (
            <Ellipsified>{row.original.table.display_name}</Ellipsified>
          ) : null,
      },
    ],
    [],
  );

  const treeTableInstance = useTreeTableInstance({
    data: segments ?? EMPTY_SEGMENTS,
    columns: columnDefs,
    getNodeId,
    getSubRows,
    globalFilter: searchQuery,
    onGlobalFilterChange: setSearchQuery,
    globalFilterFn,
  });

  const getRowHref = useCallback(
    (row: Row<Segment>) =>
      Urls.dataStudioPublishedTableSegment(
        row.original.table_id,
        row.original.id,
      ),
    [],
  );

  if (error) {
    return <LoadingAndErrorWrapper loading={false} error={error} />;
  }

  const hasNoData = !segments?.length;
  const hasNoResults = !hasNoData && treeTableInstance.rows.length === 0;

  const emptyMessage = hasNoData
    ? t`No segments yet`
    : hasNoResults && searchQuery
      ? t`No segments found`
      : null;

  return (
    <PageContainer data-testid="segments-list" gap={0}>
      <PaneHeader
        breadcrumbs={
          <DataStudioBreadcrumbs>{t`Segments`}</DataStudioBreadcrumbs>
        }
        py={0}
      />
      <Stack className={CS.overflowHidden}>
        <Flex gap="md">
          <TextInput
            placeholder={t`Search...`}
            leftSection={<Icon name="search" />}
            bdrs="md"
            flex="1"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <Button
            variant="filled"
            leftSection={<Icon name="add" />}
            onClick={() => setIsTablePickerOpen(true)}
          >
            {t`New segment`}
          </Button>
        </Flex>

        <Card withBorder p={0}>
          {isLoading ? (
            <TreeTableSkeleton columnWidths={[0.4, 0.35, 0.25]} />
          ) : (
            <TreeTable
              instance={treeTableInstance}
              getRowHref={getRowHref}
              emptyState={
                emptyMessage ? <ListEmptyState label={emptyMessage} /> : null
              }
            />
          )}
        </Card>
      </Stack>
      {isTablePickerOpen && (
        <EntityPickerModal
          title={t`Select a table for the new segment`}
          models={["table"]}
          options={{
            hasLibrary: false,
            hasRecents: false,
            hasDatabases: true,
            hasConfirmButtons: true,
            hasRootCollection: false,
            hasPersonalCollections: false,
            confirmButtonText: t`Continue`,
          }}
          onChange={(item: OmniPickerItem) => {
            if (item.model === "table") {
              setIsTablePickerOpen(false);
              dispatch(push(Urls.dataStudioPublishedTableSegmentNew(item.id)));
            }
          }}
          onClose={() => setIsTablePickerOpen(false)}
        />
      )}
    </PageContainer>
  );
}
