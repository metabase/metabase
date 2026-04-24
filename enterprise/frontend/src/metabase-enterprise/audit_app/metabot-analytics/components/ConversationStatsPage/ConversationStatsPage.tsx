import { useCallback, useMemo } from "react";
import type { WithRouterProps } from "react-router";
import { push } from "react-router-redux";
import { t } from "ttag";

import { SettingsPageWrapper } from "metabase/admin/components/SettingsSection";
import { useUrlState } from "metabase/common/hooks/use-url-state";
import { MetabotAdminLayout } from "metabase/metabot/components/MetabotAdmin/MetabotAdminLayout";
import type { DateFilterValue } from "metabase/querying/common/types";
import { deserializeDateParameterValue } from "metabase/querying/parameters/utils/parsing";
import { Flex, SimpleGrid, Tabs, Title } from "metabase/ui";
import { useDispatch } from "metabase/utils/redux";

import { VIEW_GROUP_MEMBERS } from "../../constants";
import { useAuditTable } from "../../hooks/useAuditTable";
import {
  ConversationFilters,
  DEFAULT_GROUP,
  useFilterOptions,
} from "../ConversationFilters";
import {
  type UrlState as ConversationsUrlState,
  urlStateConfig as conversationsUrlStateConfig,
} from "../ConversationsPage/utils";

import S from "./ConversationStatsPage.module.css";
import { ConversationsByDayChart } from "./ConversationsByDayChart";
import { ConversationsByGroupChart } from "./ConversationsByGroupChart";
import { ConversationsByIPAddressChart } from "./ConversationsByIPAddressChart";
import { ConversationsByProfileBarChart } from "./ConversationsByProfileBarChart";
import { ConversationsBySourceChart } from "./ConversationsBySourceChart";
import { ConversationsByUserChart } from "./ConversationsByUserChart";
import { type UsageStatsMetric, getViewForMetric } from "./query-utils";
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

  const userId = useMemo(
    () => (user ? parseInt(user, 10) : undefined),
    [user],
  );
  const groupId = useMemo(() => {
    if (!group || group === DEFAULT_GROUP) {
      return undefined;
    }
    const parsed = parseInt(group, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  }, [group]);

  const { table: groupMembersTable } = useAuditTable(VIEW_GROUP_MEMBERS);

  const viewName = getViewForMetric(metric);

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

  return (
    <MetabotAdminLayout fullWidth>
      <SettingsPageWrapper mt="sm">
        <Flex align="center" justify="space-between">
          <Title order={2} display="flex" style={{ alignItems: "center" }}>
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

        <ConversationsByDayChart
          dateFilter={dateFilter}
          userId={userId}
          groupId={groupId}
          groupMembersTable={groupMembersTable}
          metric={metric}
          viewName={viewName}
          onDimensionClick={handleDayClick}
        />

        <SimpleGrid cols={2} spacing="lg">
          <ConversationsBySourceChart
            dateFilter={dateFilter}
            userId={userId}
            groupId={groupId}
            groupMembersTable={groupMembersTable}
            metric={metric}
            viewName={viewName}
          />
          <ConversationsByProfileBarChart
            dateFilter={dateFilter}
            userId={userId}
            groupId={groupId}
            groupMembersTable={groupMembersTable}
            metric={metric}
            viewName={viewName}
          />
        </SimpleGrid>

        <SimpleGrid cols={3} spacing="lg">
          <ConversationsByGroupChart
            dateFilter={dateFilter}
            userId={userId}
            groupId={groupId}
            groupMembersTable={groupMembersTable}
            metric={metric}
            viewName={viewName}
            h={500}
          />
          <ConversationsByUserChart
            dateFilter={dateFilter}
            userId={userId}
            groupId={groupId}
            groupMembersTable={groupMembersTable}
            metric={metric}
            viewName={viewName}
            onDimensionClick={handleUserClick}
            h={500}
          />
          <ConversationsByIPAddressChart
            dateFilter={dateFilter}
            userId={userId}
            groupId={groupId}
            groupMembersTable={groupMembersTable}
            metric={metric}
            viewName={viewName}
            h={500}
          />
        </SimpleGrid>
      </SettingsPageWrapper>
    </MetabotAdminLayout>
  );
}
