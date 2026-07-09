import type { Row, SortingState, Updater } from "@tanstack/react-table";
import { useCallback, useMemo } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { DateTime } from "metabase/common/components/DateTime";
import { renderMetabotProfileLabel } from "metabase/metabot/constants";
import { useDispatch } from "metabase/redux";
import {
  Badge,
  Card,
  Ellipsified,
  Stack,
  Text,
  Tooltip,
  TreeTable,
  type TreeTableColumnDef,
  TreeTableSkeleton,
  useTreeTableInstance,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import { EMPTY_CELL_PLACEHOLDER } from "metabase/utils/constants";
import { formatNumber } from "metabase/utils/formatting";
import {
  type Sorting,
  getSorting,
  getSortingState,
} from "metabase/utils/sorting";
import { getUserName } from "metabase/utils/user";
import type { SortingOptions } from "metabase-types/api";

import {
  CONVERSATION_SORT_COLUMNS,
  type ConversationSortColumn,
  type ConversationSummary,
} from "../../types";

import { DEFAULT_SORTING } from "./utils";

const COLUMN_WIDTHS = [0.16, 0.12, 0.16, 0.09, 0.09, 0.13, 0.09, 0.09, 0.07];

const toSorting = ({
  sort_column,
  sort_direction,
}: SortingOptions<ConversationSortColumn>): Sorting<ConversationSortColumn> => ({
  column: sort_column,
  direction: sort_direction,
});

const toSortingOptions = ({
  column,
  direction,
}: Sorting<ConversationSortColumn>): SortingOptions<ConversationSortColumn> => ({
  sort_column: column,
  sort_direction: direction,
});

type ConversationRow = ConversationSummary & { id: string };

type Props = {
  conversations: ConversationSummary[];
  isLoading: boolean;
  sortingOptions: SortingOptions<ConversationSortColumn>;
  onSortingOptionsChange: (
    options: SortingOptions<ConversationSortColumn>,
  ) => void;
};

export function ConversationsTable({
  conversations,
  isLoading,
  sortingOptions,
  onSortingOptionsChange,
}: Props) {
  const dispatch = useDispatch();

  const rows = useMemo<ConversationRow[]>(
    () =>
      conversations.map((convo) => ({ ...convo, id: convo.conversation_id })),
    [conversations],
  );
  const columns = useMemo(() => getColumns(), []);
  const sortingState = useMemo(
    () => getSortingState(toSorting(sortingOptions)),
    [sortingOptions],
  );

  const handleRowActivate = useCallback(
    (row: Row<ConversationRow>) => {
      dispatch(push(Urls.monitorConversationDetails(row.original.id)));
    },
    [dispatch],
  );

  const handleSortingChange = useCallback(
    (updater: Updater<SortingState>) => {
      const newSortingState =
        typeof updater === "function" ? updater(sortingState) : updater;
      onSortingOptionsChange(
        toSortingOptions(
          getSorting(newSortingState, CONVERSATION_SORT_COLUMNS) ??
            toSorting(DEFAULT_SORTING),
        ),
      );
    },
    [sortingState, onSortingOptionsChange],
  );

  const treeTableInstance = useTreeTableInstance<ConversationRow>({
    data: rows,
    columns,
    sorting: sortingState,
    manualSorting: true,
    getNodeId: (row) => row.id,
    onRowActivate: handleRowActivate,
    onSortingChange: handleSortingChange,
  });

  return (
    <Card
      flex="1 1 auto"
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
          emptyState={
            <Stack p="xl" align="center">
              <Text c="text-disabled">{t`No conversations found`}</Text>
            </Stack>
          }
          getRowProps={() => ({ "data-testid": "conversation-row" })}
          onRowClick={handleRowActivate}
        />
      )}
    </Card>
  );
}

function getColumns(): TreeTableColumnDef<ConversationRow>[] {
  return [
    {
      id: "user",
      header: t`User`,
      width: "auto",
      minWidth: 120,
      maxAutoWidth: 200,
      enableSorting: true,
      accessorFn: (convo) => (convo.user ? getUserName(convo.user) : ""),
      cell: ({ row }) =>
        row.original.user ? getUserName(row.original.user) : t`Unknown`,
    },
    {
      id: "profile_id",
      header: t`Profile`,
      width: "auto",
      minWidth: 100,
      maxAutoWidth: 160,
      enableSorting: true,
      accessorFn: (convo) => convo.profile_id ?? "",
      cell: ({ row }) =>
        row.original.profile_id ? (
          <Badge size="sm" variant="light">
            {renderMetabotProfileLabel(row.original.profile_id)}
          </Badge>
        ) : null,
    },
    {
      id: "created_at",
      header: t`Date`,
      width: "auto",
      minWidth: 150,
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
      maxAutoWidth: 100,
      enableSorting: true,
      accessorFn: (convo) => convo.message_count,
      cell: ({ row }) => formatNumber(row.original.message_count),
    },
    {
      id: "total_tokens",
      header: t`Tokens`,
      width: "auto",
      minWidth: 80,
      maxAutoWidth: 100,
      enableSorting: true,
      accessorFn: (convo) => convo.total_tokens,
      cell: ({ row }) => formatNumber(row.original.total_tokens),
    },
    {
      id: "cache_read_tokens",
      header: () => (
        <Tooltip
          label={t`Portion of tokens served from the provider cache. A subset of Tokens, not an additional count.`}
        >
          <span>{t`Cached tokens`}</span>
        </Tooltip>
      ),
      width: "auto",
      minWidth: 100,
      maxAutoWidth: 140,
      enableSorting: true,
      accessorFn: (convo) => convo.cache_read_tokens,
      cell: ({ row }) => formatNumber(row.original.cache_read_tokens),
    },
    {
      id: "query_count",
      header: t`Queries`,
      width: "auto",
      minWidth: 80,
      maxAutoWidth: 100,
      enableSorting: false,
      accessorFn: (convo) => convo.query_count,
      cell: ({ row }) => formatNumber(row.original.query_count),
    },
    {
      id: "search_count",
      header: t`Searches`,
      width: "auto",
      minWidth: 80,
      maxAutoWidth: 100,
      enableSorting: false,
      accessorFn: (convo) => convo.search_count,
      cell: ({ row }) => formatNumber(row.original.search_count),
    },
    {
      id: "ip_address",
      header: t`IP`,
      width: "auto",
      minWidth: 100,
      maxAutoWidth: 140,
      enableSorting: true,
      accessorFn: (convo) => convo.ip_address ?? "",
      cell: ({ row }) => row.original.ip_address ?? EMPTY_CELL_PLACEHOLDER,
    },
  ];
}
