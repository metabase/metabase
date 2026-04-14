import { useCallback, useMemo } from "react";
import type { WithRouterProps } from "react-router";
import { push } from "react-router-redux";
import { t } from "ttag";

import { SettingsPageWrapper } from "metabase/admin/components/SettingsSection";
import { useGetDatabaseMetadataQuery } from "metabase/api";
import { useUrlState } from "metabase/common/hooks/use-url-state";
import type { DateFilterValue } from "metabase/querying/common/types";
import { deserializeDateParameterValue } from "metabase/querying/parameters/utils/parsing";
import { Flex, SimpleGrid, Skeleton, Tabs, Title } from "metabase/ui";
import { useDispatch } from "metabase/utils/redux";

import { AUDIT_DB_ID } from "../../constants";
import { ConversationFilters, useFilterOptions } from "../ConversationFilters";
import {
  type UrlState as ConversationsUrlState,
  urlStateConfig as conversationsUrlStateConfig,
} from "../ConversationsPage/utils";

import S from "./ConversationStatsPage.module.css";
import { ConversationsByDayChart } from "./ConversationsByDayChart";
import { ConversationsByIPAddressChart } from "./ConversationsByIPAddressChart";
import { ConversationsByProfileBarChart } from "./ConversationsByProfileBarChart";
import { ConversationsByProfileChart } from "./ConversationsByProfileChart";
import { ConversationsBySourceChart } from "./ConversationsBySourceChart";
import { ConversationsByUserChart } from "./ConversationsByUserChart";
import type { UsageStatsMetric } from "./query-utils";
import { statsUrlStateConfig } from "./utils";

const DEFAULT_DATE_FILTER: DateFilterValue = {
  type: "relative",
  value: -30,
  unit: "day",
  options: { includeCurrent: true },
};

export function ConversationStatsPage({ location }: WithRouterProps) {
  const dispatch = useDispatch();
  const [{ date, user, group, metric }, { patchUrlState }] = useUrlState(
    location,
    statsUrlStateConfig,
  );

  const dateFilter: DateFilterValue = useMemo(() => {
    if (!date) {
      return DEFAULT_DATE_FILTER;
    }
    const parsed = deserializeDateParameterValue(date);
    if (parsed && "type" in parsed) {
      return parsed as DateFilterValue;
    }
    return DEFAULT_DATE_FILTER;
  }, [date]);

  const { userOptions, groupOptions } = useFilterOptions();
  const { isLoading: isLoadingMetadata } = useGetDatabaseMetadataQuery({
    id: AUDIT_DB_ID,
  });

  const navigateToConversations = useCallback(
    (filterOverrides: Partial<ConversationsUrlState>) => {
      dispatch(
        push({
          pathname: "/admin/metabot/usage-auditing/conversations",
          query: conversationsUrlStateConfig.serialize({
            page: 0,
            sort_column: "created_at",
            sort_direction: "desc",
            date,
            user,
            group,
            profile: null,
            ...filterOverrides,
          }),
        }),
      );
    },
    [dispatch, date, user, group],
  );

  const handleDayClick = useCallback(
    (value: unknown) => {
      if (value == null) {
        return;
      }
      const dateStr = String(value).slice(0, 10);
      navigateToConversations({ date: dateStr });
    },
    [navigateToConversations],
  );

  const handleUserClick = useCallback(
    (value: unknown) => {
      if (value == null) {
        return;
      }
      const displayName = String(value);
      const match = userOptions.find((opt) => opt.label === displayName);
      if (match) {
        navigateToConversations({ user: match.value });
      }
    },
    [navigateToConversations, userOptions],
  );

  const handleProfileClick = useCallback(
    (value: unknown) => {
      if (value == null) {
        return;
      }
      navigateToConversations({ profile: String(value) });
    },
    [navigateToConversations],
  );

  return (
    <SettingsPageWrapper mt="sm">
      <Flex align="center" justify="space-between">
        <Title order={1} display="flex" style={{ alignItems: "center" }}>
          {t`Usage stats`}
        </Title>

        <ConversationFilters
          date={date}
          onDateChange={(val) => patchUrlState({ date: val })}
          user={user}
          onUserChange={(val) => patchUrlState({ user: val })}
          group={group}
          onGroupChange={(val) => patchUrlState({ group: val })}
          userOptions={userOptions}
          groupOptions={groupOptions}
        />
      </Flex>

      <Tabs
        variant="pills"
        value={metric}
        onChange={(val) => patchUrlState({ metric: val as UsageStatsMetric })}
      >
        <Tabs.List className={S.metricTabs}>
          <Tabs.Tab
            className={S.metricTab}
            value="conversations"
          >{t`Conversations`}</Tabs.Tab>
          <Tabs.Tab
            className={S.metricTab}
            value="tokens"
          >{t`Tokens`}</Tabs.Tab>
          <Tabs.Tab
            className={S.metricTab}
            value="messages"
          >{t`Messages`}</Tabs.Tab>
        </Tabs.List>
      </Tabs>

      {isLoadingMetadata ? (
        <>
          <Skeleton h={350} />
          <SimpleGrid cols={2} spacing="lg">
            <Skeleton h={350} />
            <Skeleton h={350} />
          </SimpleGrid>
          <SimpleGrid cols={3} spacing="lg">
            <Skeleton h={350} />
            <Skeleton h={350} />
            <Skeleton h={350} />
          </SimpleGrid>
        </>
      ) : (
        <>
          <ConversationsByDayChart
            dateFilter={dateFilter}
            metric={metric}
            onDimensionClick={handleDayClick}
          />
          <SimpleGrid cols={2} spacing="lg">
            <ConversationsBySourceChart
              dateFilter={dateFilter}
              metric={metric}
            />
            <ConversationsByProfileBarChart
              dateFilter={dateFilter}
              metric={metric}
            />
          </SimpleGrid>
          <SimpleGrid cols={3} spacing="lg">
            <ConversationsByUserChart
              dateFilter={dateFilter}
              metric={metric}
              onDimensionClick={handleUserClick}
            />
            <ConversationsByProfileChart
              dateFilter={dateFilter}
              metric={metric}
              onDimensionClick={handleProfileClick}
            />
            <ConversationsByIPAddressChart
              dateFilter={dateFilter}
              metric={metric}
            />
          </SimpleGrid>
        </>
      )}
    </SettingsPageWrapper>
  );
}
