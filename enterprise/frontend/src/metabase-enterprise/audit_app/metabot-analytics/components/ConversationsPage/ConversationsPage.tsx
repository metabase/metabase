import { useMemo, useState } from "react";
import type { WithRouterProps } from "react-router";
import { t } from "ttag";

import { useListPermissionsGroupsQuery, useListUsersQuery } from "metabase/api";
import { PaginationControls } from "metabase/common/components/PaginationControls";
import { useUrlState } from "metabase/common/hooks/use-url-state";
import { getDateFilterDisplayName } from "metabase/querying/common/utils/dates";
import { DateAllOptionsWidget } from "metabase/querying/parameters/components/DateAllOptionsWidget";
import { deserializeDateParameterValue } from "metabase/querying/parameters/utils/parsing";
import { Button, Card, Flex, Popover, Select, Text } from "metabase/ui";

import { useListMetabotConversationsQuery } from "../../api";

import { ConversationsTable } from "./ConversationsTable";
import { PAGE_SIZE, urlStateConfig } from "./utils";

function getDateLabel(value: string | null): string {
  if (!value) {
    return t`Date`;
  }
  const parsed = deserializeDateParameterValue(value);
  if (parsed) {
    return getDateFilterDisplayName(parsed, { withPrefix: false });
  }
  return t`Date`;
}

export function ConversationsPage({ location }: WithRouterProps) {
  const [
    { page, sort_column, sort_direction, date, user, group, profile },
    { patchUrlState },
  ] = useUrlState(location, urlStateConfig);

  const [dateOpened, setDateOpened] = useState(false);
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

  return (
    <>
      <Flex gap="md" mt="md" wrap="wrap" align="center">
        <Popover
          opened={dateOpened}
          onChange={setDateOpened}
          position="bottom-start"
        >
          <Popover.Target>
            <Button variant="default" onClick={() => setDateOpened((o) => !o)}>
              {getDateLabel(date)}
            </Button>
          </Popover.Target>
          <Popover.Dropdown>
            <DateAllOptionsWidget
              value={date}
              onChange={(val) => {
                patchUrlState({ date: val, page: 0 });
                setDateOpened(false);
              }}
            />
          </Popover.Dropdown>
        </Popover>
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
          itemsLength={conversations.length}
          total={total}
        />
      </Flex>

      <Card withBorder p={0}>
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
    </>
  );
}
