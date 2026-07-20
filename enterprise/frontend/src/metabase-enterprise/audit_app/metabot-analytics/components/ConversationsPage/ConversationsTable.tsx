import { t } from "ttag";

import {
  AdminDataTable,
  type AdminDataTableColumn,
} from "metabase/admin/components/AdminDataTable";
import { DateTime } from "metabase/common/components/DateTime";
import { renderMetabotProfileLabel } from "metabase/metabot/constants";
import { useDispatch } from "metabase/redux";
import { push } from "metabase/router";
import { Badge, Ellipsified, Tooltip } from "metabase/ui";
import { EMPTY_CELL_PLACEHOLDER } from "metabase/utils/constants";
import { formatNumber } from "metabase/utils/formatting";
import { getUserName } from "metabase/utils/user";
import type { SortingOptions } from "metabase-types/api";

import type { ConversationSortColumn, ConversationSummary } from "../../types";

type Props = {
  conversations: ConversationSummary[];
  isLoading: boolean;
  error: unknown;
  sortingOptions: SortingOptions<ConversationSortColumn>;
  onSortingOptionsChange: (
    options: SortingOptions<ConversationSortColumn>,
  ) => void;
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
};

export function ConversationsTable({
  conversations,
  isLoading,
  error,
  sortingOptions,
  onSortingOptionsChange,
  page,
  pageSize,
  total,
  onPageChange,
}: Props) {
  const dispatch = useDispatch();

  const columns: AdminDataTableColumn<
    ConversationSummary,
    ConversationSortColumn
  >[] = [
    {
      key: "title",
      title: t`Title`,
      render: (convo) => (
        <Ellipsified style={{ maxWidth: 280 }}>
          {convo.title ?? t`Untitled`}
        </Ellipsified>
      ),
    },
    {
      key: "user",
      title: t`User`,
      sortKey: "user",
      render: (convo) => (convo.user ? getUserName(convo.user) : t`Unknown`),
    },
    {
      key: "profile_id",
      title: t`Profile`,
      sortKey: "profile_id",
      render: (convo) =>
        convo.profile_id ? (
          <Badge color="brand" variant="filled">
            {renderMetabotProfileLabel(convo.profile_id)}
          </Badge>
        ) : null,
    },
    {
      key: "created_at",
      title: t`Date`,
      sortKey: "created_at",
      render: (convo) => (
        <Ellipsified style={{ maxWidth: 180 }}>
          <DateTime value={convo.created_at} unit="day" />
        </Ellipsified>
      ),
    },
    {
      key: "message_count",
      title: t`Messages`,
      sortKey: "message_count",
      headerProps: { style: { width: "5rem" } },
      render: (convo) => formatNumber(convo.message_count),
    },
    {
      key: "total_tokens",
      title: t`Tokens`,
      sortKey: "total_tokens",
      render: (convo) => formatNumber(convo.total_tokens),
    },
    {
      key: "cache_read_tokens",
      title: (
        <Tooltip
          label={t`Portion of tokens served from the provider cache. A subset of Tokens, not an additional count.`}
        >
          <span>{t`Cached tokens`}</span>
        </Tooltip>
      ),
      sortKey: "cache_read_tokens",
      render: (convo) => formatNumber(convo.cache_read_tokens),
    },
    {
      key: "query_count",
      title: t`Queries`,
      render: (convo) => formatNumber(convo.query_count),
    },
    {
      key: "search_count",
      title: t`Searches`,
      render: (convo) => formatNumber(convo.search_count),
    },
    {
      key: "ip_address",
      title: t`IP`,
      sortKey: "ip_address",
      render: (convo) => convo.ip_address ?? EMPTY_CELL_PLACEHOLDER,
    },
  ];

  return (
    <AdminDataTable
      columns={columns}
      rows={conversations}
      getRowKey={(convo) => convo.conversation_id}
      sorting={{ sortingOptions, onSortingOptionsChange }}
      pagination={{ page, pageSize, total, onPageChange }}
      loading={isLoading}
      error={error}
      emptyText={t`No conversations found`}
      maxBodyHeight="calc(100vh - 20rem)"
      onRowClick={(convo) =>
        dispatch(
          push(
            `/admin/metabot/usage-auditing/conversations/${convo.conversation_id}`,
          ),
        )
      }
    />
  );
}
