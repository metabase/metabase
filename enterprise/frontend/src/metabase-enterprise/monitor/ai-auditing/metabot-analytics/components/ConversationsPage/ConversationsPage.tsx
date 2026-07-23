import { useMemo } from "react";
import { t } from "ttag";

import { PaginationControls } from "metabase/common/components/PaginationControls";
import { useUrlState } from "metabase/common/hooks/use-url-state";
import { MonitorHeaderTitle } from "metabase/monitor/components/MonitorHeaderTitle";
import { MonitorMain } from "metabase/monitor/components/MonitorLayout";
import type { WithRouterProps } from "metabase/router";
import { Flex } from "metabase/ui";

import { useListMetabotAnalyticsConversationsQuery } from "../../api";
import { ConversationFilters, useFilterOptions } from "../ConversationFilters";

import { ConversationsTable } from "./ConversationsTable";
import { PAGE_SIZE, urlStateConfig } from "./utils";

export function ConversationsPage({ location }: WithRouterProps) {
  const [
    { page, sort_column, sort_direction, date, user, group, tenant },
    { patchUrlState },
  ] = useUrlState(location, urlStateConfig);

  const {
    userId,
    groupId,
    groupNoFilterValue,
    tenantId,
    userOptions,
    groupOptions,
    tenantOptions,
    hasTenants,
  } = useFilterOptions({ date, user, group, tenant });

  const {
    data: conversationsData,
    isLoading,
    isFetching,
    error,
  } = useListMetabotAnalyticsConversationsQuery(
    {
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
      sort_by: sort_column,
      sort_dir: sort_direction,
      user_id: userId,
      group_id: groupId,
      tenant_id: tenantId,
      date: date ?? undefined,
    },
    { refetchOnMountOrArgChange: true },
  );

  const conversations = useMemo(
    () => conversationsData?.data ?? [],
    [conversationsData],
  );
  const total = conversationsData?.total ?? 0;

  return (
    <Flex h="100%" wrap="nowrap">
      <MonitorMain>
        <MonitorHeaderTitle mb="sm">{t`Conversations`}</MonitorHeaderTitle>

        <ConversationFilters
          date={date}
          onDateChange={(val) => patchUrlState({ date: val, page: 0 })}
          user={user}
          onUserChange={(val) => patchUrlState({ user: val, page: 0 })}
          group={group}
          onGroupChange={(val) => patchUrlState({ group: val, page: 0 })}
          groupNoFilterValue={groupNoFilterValue}
          tenant={tenant}
          onTenantChange={(val) => patchUrlState({ tenant: val, page: 0 })}
          userOptions={userOptions}
          groupOptions={groupOptions}
          tenantOptions={tenantOptions}
          hasTenants={hasTenants}
        />

        <ConversationsTable
          conversations={conversations}
          isLoading={isLoading}
          isFetching={isFetching}
          error={error}
          page={page}
          sortingOptions={{ sort_column, sort_direction }}
          onSortingOptionsChange={(newSortingOptions) =>
            patchUrlState({ ...newSortingOptions, page: 0 })
          }
        />

        {!isLoading && error == null && (
          <Flex justify="flex-end">
            <PaginationControls
              onPreviousPage={() => patchUrlState({ page: page - 1 })}
              onNextPage={() => patchUrlState({ page: page + 1 })}
              page={page}
              pageSize={PAGE_SIZE}
              itemsLength={conversations.length}
              total={total}
              showTotal
            />
          </Flex>
        )}
      </MonitorMain>
    </Flex>
  );
}
