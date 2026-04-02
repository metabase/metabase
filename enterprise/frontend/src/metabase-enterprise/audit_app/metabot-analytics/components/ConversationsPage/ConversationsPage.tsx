import { useMemo } from "react";
import type { WithRouterProps } from "react-router";
import { t } from "ttag";

import { useListPermissionsGroupsQuery, useListUsersQuery } from "metabase/api";
import { PaginationControls } from "metabase/common/components/PaginationControls";
import { useUrlState } from "metabase/common/hooks/use-url-state";
import { Card, Flex, Select, Text } from "metabase/ui";

import { useListMetabotConversationsQuery } from "../../api";
import type { ConversationSummary } from "../../types";

import { ConversationsTable } from "./ConversationsTable";
import { PAGE_SIZE, urlStateConfig } from "./utils";

function getDateOptions() {
  return [
    { value: "7", label: t`Past 7 days` },
    { value: "14", label: t`Past 14 days` },
    { value: "30", label: t`Past 30 days` },
    { value: "60", label: t`Past 60 days` },
    { value: "90", label: t`Past 90 days` },
  ];
}

function filterConversations(
  conversations: ConversationSummary[],
  filters: { date: string | null; profile: string | null },
): ConversationSummary[] {
  return conversations.filter((c) => {
    if (filters.profile && c.model !== filters.profile) {
      return false;
    }
    if (filters.date) {
      const days = parseInt(filters.date, 10);
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      if (new Date(c.created_at) < cutoff) {
        return false;
      }
    }
    return true;
  });
}

export function ConversationsPage({ location }: WithRouterProps) {
  const [
    { page, sort_column, sort_direction, date, user, group, profile },
    { patchUrlState },
  ] = useUrlState(location, urlStateConfig);

  const sortingOptions = { sort_column, sort_direction };

  const { data: usersData } = useListUsersQuery({});
  const { data: groupsData } = useListPermissionsGroupsQuery(undefined);

  const userOptions = useMemo(
    () =>
      (usersData?.data ?? []).map((u) => ({
        value: String(u.id),
        label:
          [u.first_name, u.last_name].filter(Boolean).join(" ") ||
          u.email ||
          String(u.id),
      })),
    [usersData],
  );

  const groupOptions = useMemo(
    () =>
      (groupsData ?? []).map((g) => ({
        value: String(g.id),
        label: g.name,
      })),
    [groupsData],
  );

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
    },
    { refetchOnMountOrArgChange: true },
  );

  const conversations = useMemo(
    () => conversationsData?.data ?? [],
    [conversationsData],
  );
  const total = conversationsData?.total ?? 0;

  const profileOptions = useMemo(() => {
    const profiles = new Set(
      conversations.map((c) => c.model).filter(Boolean) as string[],
    );
    return Array.from(profiles)
      .sort()
      .map((p) => ({ value: p, label: p }));
  }, [conversations]);

  const filtered = filterConversations(conversations, { date, profile });

  return (
    <>
      <Flex gap="md" mt="md" wrap="wrap">
        <Select
          placeholder={t`Date`}
          data={getDateOptions()}
          value={date}
          onChange={(val) => patchUrlState({ date: val, page: 0 })}
          clearable
          w={150}
        />
        <Select
          placeholder={t`User`}
          data={userOptions}
          value={user}
          onChange={(val) => patchUrlState({ user: val, page: 0 })}
          clearable
          searchable
          w={180}
        />
        <Select
          placeholder={t`Group`}
          data={groupOptions}
          value={group}
          onChange={(val) => patchUrlState({ group: val, page: 0 })}
          clearable
          searchable
          w={180}
        />
        <Select
          placeholder={t`Profile`}
          data={profileOptions}
          value={profile}
          onChange={(val) => patchUrlState({ profile: val, page: 0 })}
          clearable
          w={150}
        />
      </Flex>

      <Text size="sm" c="text-tertiary" mt="md">
        {t`${total} conversations`}
      </Text>

      <Flex justify="flex-end" mt="sm">
        <PaginationControls
          onPreviousPage={() => patchUrlState({ page: page - 1 })}
          onNextPage={() => patchUrlState({ page: page + 1 })}
          page={page}
          pageSize={PAGE_SIZE}
          itemsLength={filtered.length}
          total={total}
        />
      </Flex>

      <Card withBorder p={0}>
        <ConversationsTable
          conversations={filtered}
          isLoading={isLoading}
          error={error}
          sortingOptions={sortingOptions}
          onSortingOptionsChange={(newSortingOptions) =>
            patchUrlState({ ...newSortingOptions, page: 0 })
          }
        />
      </Card>
    </>
  );
}
