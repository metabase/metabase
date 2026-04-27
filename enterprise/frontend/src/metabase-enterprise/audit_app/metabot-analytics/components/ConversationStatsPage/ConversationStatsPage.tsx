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

import {
  VIEW_CONVERSATIONS,
  VIEW_GROUP_MEMBERS,
  VIEW_USAGE_LOG,
} from "../../constants";
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
import { ConversationsByTenantChart } from "./ConversationsByTenantChart";
import { ConversationsByUserChart } from "./ConversationsByUserChart";
import type { UsageStatsMetric } from "./query-utils";
import type { ChartProps } from "./types";
import { statsUrlStateConfig } from "./utils";

const DEFAULT_DATE_FILTER: DateFilterValue = {
  type: "relative",
  value: -30,
  unit: "day",
  options: { includeCurrent: true },
};

export function ConversationStatsPage({ location }: WithRouterProps) {
  const dispatch = useDispatch();
  const [{ date, user, group, tenant, metric }, { patchUrlState }] =
    useUrlState(location, statsUrlStateConfig);

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

  const { userOptions, groupOptions, tenantOptions, hasTenants } =
    useFilterOptions();

  const userId = useMemo(() => (user ? parseInt(user, 10) : undefined), [user]);
  const groupId = useMemo(() => {
    if (!group || group === DEFAULT_GROUP) {
      return undefined;
    }
    const parsed = parseInt(group, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  }, [group]);
  const tenantId = useMemo(() => {
    if (!hasTenants || !tenant) {
      return undefined;
    }
    const parsed = parseInt(tenant, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  }, [hasTenants, tenant]);

  const conversationsAudit = useAuditTable(VIEW_CONVERSATIONS);
  const usageLogAudit = useAuditTable(VIEW_USAGE_LOG);
  const groupMembersAudit = useAuditTable(VIEW_GROUP_MEMBERS);

  const sharedChartProps: ChartProps = {
    provider: conversationsAudit.provider,
    table: metric === "tokens" ? usageLogAudit.table : conversationsAudit.table,
    groupMembersTable: groupMembersAudit.table,
    dateFilter,
    userId,
    groupId,
    tenantId,
    metric,
  };

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
            tenant,
            ...filterOverrides,
          }),
        }),
      );
    },
    [dispatch, date, user, group, tenant],
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
            tenant={tenant}
            onTenantChange={(val) => patchUrlState({ tenant: val })}
            userOptions={userOptions}
            groupOptions={groupOptions}
            tenantOptions={tenantOptions}
            hasTenants={hasTenants}
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
          {...sharedChartProps}
          onDimensionClick={handleDayClick}
        />

        <SimpleGrid cols={2} spacing="lg">
          <ConversationsBySourceChart {...sharedChartProps} />
          <ConversationsByProfileBarChart {...sharedChartProps} />
        </SimpleGrid>

        <SimpleGrid cols={hasTenants ? 2 : 3} spacing="lg">
          {hasTenants && (
            <ConversationsByTenantChart
              {...sharedChartProps}
              tenantOptions={tenantOptions}
              h={500}
            />
          )}
          <ConversationsByGroupChart {...sharedChartProps} h={500} />
          <ConversationsByUserChart
            {...sharedChartProps}
            onDimensionClick={handleUserClick}
            h={500}
          />
          <ConversationsByIPAddressChart {...sharedChartProps} h={500} />
        </SimpleGrid>
      </SettingsPageWrapper>
    </MetabotAdminLayout>
  );
}
