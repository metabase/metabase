import type { Row } from "@tanstack/react-table";
import { type MouseEvent, useCallback, useMemo } from "react";
import { t } from "ttag";

import { DateTime } from "metabase/common/components/DateTime";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useScrollToTop } from "metabase/common/hooks";
import { useSortingStateChange } from "metabase/common/hooks/use-sorting-state-change";
import { renderMetabotProfileLabel } from "metabase/metabot/constants";
import { MonitorEmptyState } from "metabase/monitor/components/MonitorEmptyState";
import { useDispatch } from "metabase/redux";
import { push } from "metabase/router";
import {
  Badge,
  Card,
  Center,
  Ellipsified,
  SortableHeaderPill,
  Tooltip,
  TreeTable,
  type TreeTableColumnDef,
  TreeTableSkeleton,
  useTreeTableInstance,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import { EMPTY_CELL_PLACEHOLDER } from "metabase/utils/constants";
import { formatNumber } from "metabase/utils/formatting";
import { getUserName } from "metabase/utils/user";
import type { SortingOptions } from "metabase-types/api";

import {
  CONVERSATION_SORT_COLUMNS,
  type ConversationSortColumn,
  type ConversationSummary,
} from "../../types";

const COLUMN_WIDTHS = [
  0.14, 0.14, 0.11, 0.12, 0.08, 0.09, 0.1, 0.08, 0.08, 0.06,
];

const DEFAULT_SORTING: SortingOptions<ConversationSortColumn> = {
  sort_column: "created_at",
  sort_direction: "desc",
};

type ConversationRow = ConversationSummary & { id: string };

type Props = {
  conversations: ConversationSummary[];
  isLoading: boolean;
  isFetching: boolean;
  error: unknown;
  page: number;
  sortingOptions: SortingOptions<ConversationSortColumn>;
  onSortingOptionsChange: (
    options: SortingOptions<ConversationSortColumn>,
  ) => void;
};

export function ConversationsTable({
  conversations,
  isLoading,
  isFetching,
  error,
  page,
  sortingOptions,
  onSortingOptionsChange,
}: Props) {
  const dispatch = useDispatch();

  const rows: ConversationRow[] = useMemo(
    () =>
      conversations.map((convo) => ({ ...convo, id: convo.conversation_id })),
    [conversations],
  );
  const columns = useMemo(() => getColumns(), []);

  const { sortingState, onSortingChange } = useSortingStateChange({
    sortingOptions,
    columns: CONVERSATION_SORT_COLUMNS,
    defaultSorting: DEFAULT_SORTING,
    onSortingOptionsChange,
  });

  const getRowHref = useCallback(
    (row: Row<ConversationRow>) =>
      Urls.monitorAiAuditingConversationDetail(row.original.conversation_id),
    [],
  );

  const handleRowActivate = useCallback(
    (row: Row<ConversationRow>) => {
      dispatch(push(getRowHref(row)));
    },
    [dispatch, getRowHref],
  );

  // Let the browser handle modified clicks (new tab / context menu) via the row link.
  const handleRowClick = useCallback(
    (row: Row<ConversationRow>, event: MouseEvent) => {
      const isModifiedClick = event.metaKey || event.ctrlKey || event.shiftKey;
      if (!isModifiedClick) {
        handleRowActivate(row);
      }
    },
    [handleRowActivate],
  );

  const treeTableInstance = useTreeTableInstance<ConversationRow>({
    data: rows,
    columns,
    sorting: sortingState,
    manualSorting: true,
    getNodeId: (convo) => convo.id,
    onRowActivate: handleRowActivate,
    onSortingChange,
  });

  useScrollToTop({
    ref: treeTableInstance.containerRef,
    keys: [page, sortingOptions],
    skip: isFetching,
  });

  if (error != null) {
    return (
      <Card
        flex="0 1 auto"
        mih={0}
        p={0}
        withBorder
        data-testid="conversations-table"
      >
        <Center p="xl">
          <LoadingAndErrorWrapper loading={false} error={error} />
        </Center>
      </Card>
    );
  }

  return (
    <Card
      flex="0 1 auto"
      mih={0}
      p={0}
      withBorder
      data-testid="conversations-table"
    >
      {isLoading ? (
        <TreeTableSkeleton columnWidths={COLUMN_WIDTHS} />
      ) : (
        <TreeTable
          instance={treeTableInstance}
          hierarchical={false}
          ariaLabel={t`Conversations`}
          emptyState={<MonitorEmptyState label={t`No conversations found`} />}
          getRowProps={() => ({ "data-testid": "conversation" })}
          getRowHref={getRowHref}
          onRowClick={handleRowClick}
        />
      )}
    </Card>

  );
}

function getColumns(): TreeTableColumnDef<ConversationRow>[] {
  return [
    {
      id: "title",
      header: t`Title`,
      width: "auto",
      minWidth: 160,
      maxAutoWidth: 280,
      enableSorting: false,
      accessorFn: (convo) => convo.title ?? "",
      cell: ({ row }) => (
        <Ellipsified style={{ maxWidth: 280 }}>
          {row.original.title ?? t`Untitled`}
        </Ellipsified>
      ),
    },
    {
      id: "user",
      header: t`User`,
      width: "auto",
      minWidth: 120,
      maxAutoWidth: 240,
      enableSorting: true,
      sortDescFirst: false,
      accessorFn: (convo) =>
        convo.user ? getUserName(convo.user) : t`Unknown`,
      cell: ({ row }) =>
        row.original.user ? getUserName(row.original.user) : t`Unknown`,
    },
    {
      id: "profile_id",
      header: t`Profile`,
      width: "auto",
      minWidth: 100,
      maxAutoWidth: 200,
      enableSorting: true,
      sortDescFirst: false,
      accessorFn: (convo) => convo.profile_id ?? "",
      cell: ({ row }) =>
        row.original.profile_id ? (
          <Badge color="brand" variant="filled">
            {renderMetabotProfileLabel(row.original.profile_id)}
          </Badge>
        ) : (
          EMPTY_CELL_PLACEHOLDER
        ),
    },
    {
      id: "created_at",
      header: t`Date`,
      width: "auto",
      minWidth: 120,
      enableSorting: true,
      sortDescFirst: true,
      accessorFn: (convo) => convo.created_at,
      cell: ({ row }) => (
        <Ellipsified style={{ maxWidth: 180 }}>
          <DateTime value={row.original.created_at} unit="day" />
        </Ellipsified>
      ),
    },
    {
      id: "message_count",
      header: t`Messages`,
      width: "auto",
      minWidth: 80,
      enableSorting: true,
      sortDescFirst: false,
      accessorFn: (convo) => convo.message_count,
      cell: ({ row }) => formatNumber(row.original.message_count),
    },
    {
      id: "total_tokens",
      header: t`Tokens`,
      width: "auto",
      minWidth: 90,
      enableSorting: true,
      sortDescFirst: false,
      accessorFn: (convo) => convo.total_tokens,
      cell: ({ row }) => formatNumber(row.original.total_tokens),
    },
    {
      id: "cache_read_tokens",
      header: ({ column }) => (
        <Tooltip
          label={t`Portion of tokens served from the provider cache. A subset of Tokens, not an additional count.`}
        >
          <SortableHeaderPill
            name={t`Cached tokens`}
            sort={column.getIsSorted() || undefined}
          />
        </Tooltip>
      ),
      width: "auto",
      minWidth: 110,
      enableSorting: true,
      sortDescFirst: false,
      accessorFn: (convo) => convo.cache_read_tokens,
      cell: ({ row }) => formatNumber(row.original.cache_read_tokens),
    },
    {
      id: "query_count",
      header: t`Queries`,
      width: "auto",
      minWidth: 80,
      enableSorting: false,
      accessorFn: (convo) => convo.query_count,
      cell: ({ row }) => formatNumber(row.original.query_count),
    },
    {
      id: "search_count",
      header: t`Searches`,
      width: "auto",
      minWidth: 80,
      enableSorting: false,
      accessorFn: (convo) => convo.search_count,
      cell: ({ row }) => formatNumber(row.original.search_count),
    },
    {
      id: "ip_address",
      header: t`IP`,
      width: "auto",
      minWidth: 100,
      enableSorting: true,
      sortDescFirst: false,
      accessorFn: (convo) => convo.ip_address ?? "",
      cell: ({ row }) => row.original.ip_address ?? EMPTY_CELL_PLACEHOLDER,
    },
  ];
}
