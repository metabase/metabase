import type { Row } from "@tanstack/react-table";
import dayjs from "dayjs";
import { type ReactNode, useCallback, useMemo } from "react";
import { t } from "ttag";

import {
  useLazyListPersistedInfoQuery,
  useRefreshModelCacheMutation,
} from "metabase/api";
import { DateTime } from "metabase/common/components/DateTime";
import { Link } from "metabase/common/components/Link";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { PaginationControls } from "metabase/common/components/PaginationControls";
import { useAbortableQuery } from "metabase/common/hooks/use-abortable-query";
import { usePagination } from "metabase/common/hooks/use-pagination";
import { MonitorHeaderTitle } from "metabase/monitor/components/MonitorHeaderTitle";
import { useDispatch } from "metabase/redux";
import { push } from "metabase/router";
import {
  ActionIcon,
  Card,
  Center,
  Ellipsified,
  Flex,
  Icon,
  Stack,
  Text,
  Tooltip,
  TreeTable,
  type TreeTableColumnDef,
  TreeTableSkeleton,
  useTreeTableInstance,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import { capitalize } from "metabase/utils/formatting";
import { checkCanRefreshModelCache } from "metabase-lib/v1/metadata/utils/models";
import type { ModelCacheRefreshStatus } from "metabase-types/api";

import S from "./ModelCacheRefreshJobs.module.css";

const PAGE_SIZE = 20;

const COLUMN_WIDTHS = [0.22, 0.16, 0.28, 0.14, 0.14, 0.06];

export function ModelCacheRefreshJobs() {
  const dispatch = useDispatch();
  const [refreshModelCache] = useRefreshModelCacheMutation();
  const { page, handleNextPage, handlePreviousPage } = usePagination();

  const { data, error, isFetching } = useAbortableQuery(
    useLazyListPersistedInfoQuery,
    {
      limit: PAGE_SIZE,
      offset: PAGE_SIZE * page,
    },
  );
  const { data: persistedModels, total } = data ?? { data: [], total: 0 };

  // "deletable" records are pending cleanup and aren't shown to the user
  const jobs = useMemo(
    () => persistedModels.filter((info) => info.state !== "deletable"),
    [persistedModels],
  );
  const hasPagination = total > PAGE_SIZE;

  const columns = useMemo(
    () => getColumns((job) => refreshModelCache(job.card_id)),
    [refreshModelCache],
  );

  const handleRowActivate = useCallback(
    (row: Row<ModelCacheRefreshStatus>) => {
      const { card_id, card_name } = row.original;
      dispatch(push(Urls.model({ id: card_id, name: card_name })));
    },
    [dispatch],
  );

  const treeTableInstance = useTreeTableInstance<ModelCacheRefreshStatus>({
    data: jobs,
    columns,
    getNodeId: (job) => String(job.id),
    onRowActivate: handleRowActivate,
  });

  if (error != null) {
    return (
      <Center flex={1}>
        <DelayedLoadingAndErrorWrapper loading={isFetching} error={error} />
      </Center>
    );
  }

  return (
    <>
      <Card
        flex="0 1 auto"
        mih={0}
        p={0}
        withBorder
        data-testid="model-cache-logs"
      >
        {isFetching ? (
          <TreeTableSkeleton columnWidths={COLUMN_WIDTHS} />
        ) : (
          <TreeTable
            instance={treeTableInstance}
            hierarchical={false}
            ariaLabel={t`Model cache log`}
            emptyState={
              <Stack p="xl" align="center">
                <Text c="text-disabled">{t`No results`}</Text>
              </Stack>
            }
            getRowProps={() => ({ "data-testid": "model-cache-log-row" })}
            onRowClick={handleRowActivate}
          />
        )}
      </Card>

      {!isFetching && hasPagination && (
        <Flex justify="end">
          <PaginationControls
            showTotal
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            itemsLength={persistedModels.length}
            onNextPage={handleNextPage}
            onPreviousPage={handlePreviousPage}
          />
        </Flex>
      )}
    </>
  );
}

export function ModelCachePage({ children }: { children?: ReactNode }) {
  return (
    <Flex h="100%" wrap="nowrap">
      <Stack className={S.main} flex={1} gap="md">
        <MonitorHeaderTitle mb="sm">{t`Model cache log`}</MonitorHeaderTitle>
        <ModelCacheRefreshJobs />
      </Stack>
      {children /* refresh modal */}
    </Flex>
  );
}

function getColumns(
  onRefresh: (job: ModelCacheRefreshStatus) => void,
): TreeTableColumnDef<ModelCacheRefreshStatus>[] {
  return [
    {
      id: "model",
      header: t`Model`,
      minWidth: "auto",
      maxAutoWidth: 300,
      enableSorting: true,
      sortDescFirst: false,
      accessorFn: (job) => job.card_name,
      cell: ({ row }) => (
        <Ellipsified fw="bold">{row.original.card_name}</Ellipsified>
      ),
    },
    {
      id: "collection",
      header: t`Collection`,
      minWidth: "auto",
      maxAutoWidth: 240,
      enableSorting: true,
      sortDescFirst: false,
      accessorFn: (job) => job.collection_name ?? t`Our analytics`,
      cell: ({ row }) => {
        const { collection_id, collection_name } = row.original;
        return (
          <Link
            variant="brand"
            to={Urls.collection({ id: collection_id, name: collection_name })}
            onClick={(event) => event.stopPropagation()}
          >
            <Ellipsified>{collection_name || t`Our analytics`}</Ellipsified>
          </Link>
        );
      },
    },
    {
      id: "status",
      header: t`Status`,
      width: "auto",
      minWidth: 120,
      maxAutoWidth: 320,
      enableSorting: true,
      sortDescFirst: false,
      accessorFn: (job) => job.state,
      cell: ({ row }) => <ModelCacheStatus job={row.original} />,
    },
    {
      id: "last_run_at",
      header: t`Last run at`,
      width: "auto",
      minWidth: 130,
      enableSorting: true,
      sortDescFirst: true,
      accessorFn: (job) => job.refresh_begin,
      cell: ({ row }) => (
        <Tooltip label={<DateTime value={row.original.refresh_begin} />}>
          <Text span>
            {capitalize(dayjs(row.original.refresh_begin).fromNow())}
          </Text>
        </Tooltip>
      ),
    },
    {
      id: "created_by",
      header: t`Created by`,
      width: "auto",
      minWidth: 110,
      maxAutoWidth: 200,
      enableSorting: true,
      sortDescFirst: false,
      accessorFn: (job) => job.creator?.common_name ?? t`Automatic`,
      cell: ({ row }) => row.original.creator?.common_name || t`Automatic`,
    },
    {
      id: "actions",
      header: "",
      width: 60,
      enableSorting: false,
      cell: ({ row }) =>
        checkCanRefreshModelCache(row.original) ? (
          <Flex justify="flex-end" w="100%">
            <Tooltip label={t`Refresh`}>
              <ActionIcon
                aria-label={t`Refresh`}
                onClick={(event) => {
                  event.stopPropagation();
                  onRefresh(row.original);
                }}
              >
                <Icon name="refresh" />
              </ActionIcon>
            </Tooltip>
          </Flex>
        ) : null,
    },
  ];
}

function ModelCacheStatus({
  job,
}: {
  job: ModelCacheRefreshStatus;
}): ReactNode {
  switch (job.state) {
    case "off":
      return t`Off`;
    case "creating":
      return t`Queued`;
    case "refreshing":
      return t`Refreshing`;
    case "persisted":
      return t`Completed`;
    case "error":
      return (
        <Link
          to={Urls.monitorModelCacheRefreshJob(job.id)}
          onClick={(event) => event.stopPropagation()}
        >
          <Ellipsified ff="monospace" c="error">
            {job.error}
          </Ellipsified>
        </Link>
      );
    default:
      return job.state;
  }
}
