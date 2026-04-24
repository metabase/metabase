import { useMemo } from "react";
import type { WithRouterProps } from "react-router";
import { t } from "ttag";

import { SettingsPageWrapper } from "metabase/admin/components/SettingsSection";
import { PaginationControls } from "metabase/common/components/PaginationControls";
import { useUrlState } from "metabase/common/hooks/use-url-state";
import { MetabotAdminLayout } from "metabase/metabot/components/MetabotAdmin/MetabotAdminLayout";
import { Card, Flex, Title } from "metabase/ui";

import { useListMetabotConversationsQuery } from "../../api";
import {
  ConversationFilters,
  DEFAULT_GROUP,
  useFilterOptions,
} from "../ConversationFilters";

import { ConversationsTable } from "./ConversationsTable";
import { PAGE_SIZE, urlStateConfig } from "./utils";

export function ConversationsPage({ location }: WithRouterProps) {
  const [
    { page, sort_column, sort_direction, date, user, group },
    { patchUrlState },
  ] = useUrlState(location, urlStateConfig);

  const sortingOptions = { sort_column, sort_direction };
  const { userOptions, groupOptions } = useFilterOptions();

  const groupId =
    group && group !== DEFAULT_GROUP ? parseInt(group, 10) : undefined;

  // Exclude-shape date filters (e.g. "exclude-days-Mon") can't be expressed
  // as a single [start, end) range that the list endpoint accepts; drop them
  // instead of surfacing a 400. Stats charts still apply them natively.
  const dateParam = date && !date.startsWith("exclude-") ? date : undefined;

  const {
    data: conversationsData,
    isLoading,
    error,
  } = useListMetabotConversationsQuery(
    {
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
      "sort-by": sort_column,
      "sort-dir": sort_direction,
      "user-id": user ? parseInt(user, 10) : undefined,
      "group-id": groupId,
      date: dateParam,
    },
    { refetchOnMountOrArgChange: true },
  );

  const conversations = useMemo(
    () => conversationsData?.data ?? [],
    [conversationsData],
  );
  const total = conversationsData?.total ?? 0;

  return (
    <MetabotAdminLayout fullWidth>
      <SettingsPageWrapper mt="sm">
        <Flex align="center" justify="space-between">
          <Title order={2} display="flex" style={{ alignItems: "center" }}>
            {t`Conversations`}
          </Title>

          <ConversationFilters
            date={date}
            onDateChange={(val) => patchUrlState({ date: val, page: 0 })}
            user={user}
            onUserChange={(val) => patchUrlState({ user: val, page: 0 })}
            group={group}
            onGroupChange={(val) => patchUrlState({ group: val, page: 0 })}
            userOptions={userOptions}
            groupOptions={groupOptions}
          />
        </Flex>

        <Card withBorder shadow="none" p={0}>
          <ConversationsTable
            conversations={conversations}
            isLoading={isLoading}
            error={error}
            sortingOptions={sortingOptions}
            onSortingOptionsChange={(newSortingOptions) =>
              patchUrlState({ ...newSortingOptions, page: 0 })
            }
          />
        </Card>

        <Flex justify="flex-end">
          <PaginationControls
            onPreviousPage={() => patchUrlState({ page: page - 1 })}
            onNextPage={() => patchUrlState({ page: page + 1 })}
            page={page}
            pageSize={PAGE_SIZE}
            itemsLength={conversations.length}
            total={total}
          />
        </Flex>
      </SettingsPageWrapper>
    </MetabotAdminLayout>
  );
}
