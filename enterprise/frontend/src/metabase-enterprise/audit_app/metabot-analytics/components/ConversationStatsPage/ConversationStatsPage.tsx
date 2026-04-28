import dayjs from "dayjs";
import { useCallback, useMemo } from "react";
import type { WithRouterProps } from "react-router";
import { push } from "react-router-redux";
import { t } from "ttag";

import { SettingsPageWrapper } from "metabase/admin/components/SettingsSection";
import { useUrlState } from "metabase/common/hooks/use-url-state";
import { MetabotAdminLayout } from "metabase/metabot/components/MetabotAdmin/MetabotAdminLayout";
import { useDispatch } from "metabase/redux";
import { Flex, SimpleGrid, Tabs, Title } from "metabase/ui";

import {
  VIEW_CONVERSATIONS,
  VIEW_GROUP_MEMBERS,
  VIEW_USAGE_LOG,
} from "../../constants";
import { useAuditTable } from "../../hooks/useAuditTable";
import { ConversationFilters, useFilterOptions } from "../ConversationFilters";
import {
  type UrlState as ConversationsUrlState,
  urlStateConfig as conversationsUrlStateConfig,
} from "../ConversationsPage/utils";

import { BreakoutChart } from "./BreakoutChart";
import S from "./ConversationStatsPage.module.css";
import { ConversationsByDayChart } from "./ConversationsByDayChart";
import {
  type StatsFilters,
  type UsageStatsMetric,
  buildGroupBreakoutQuery,
  buildSourceBreakoutQuery,
  buildTenantBreakoutQuery,
} from "./query-utils";
import type { ChartDataSources, ChartProps } from "./types";
import { statsUrlStateConfig } from "./utils";

const sourceTitles: Record<UsageStatsMetric, string> = {
  get conversations() {
    return t`Conversations by source`;
  },
  get messages() {
    return t`Messages by source`;
  },
  get tokens() {
    return t`Tokens by source`;
  },
};

const profileTitles: Record<UsageStatsMetric, string> = {
  get conversations() {
    return t`Conversations by profile`;
  },
  get messages() {
    return t`Messages by profile`;
  },
  get tokens() {
    return t`Tokens by profile`;
  },
};

const userTitles: Record<UsageStatsMetric, string> = {
  get conversations() {
    return t`Users with most conversations`;
  },
  get messages() {
    return t`Users with most messages`;
  },
  get tokens() {
    return t`Users with most tokens`;
  },
};

const groupTitles: Record<UsageStatsMetric, string> = {
  get conversations() {
    return t`Groups with most conversations`;
  },
  get messages() {
    return t`Groups with most messages`;
  },
  get tokens() {
    return t`Groups with most tokens`;
  },
};

const ipAddressTitles: Record<UsageStatsMetric, string> = {
  get conversations() {
    return t`IP addresses with most conversations`;
  },
  get messages() {
    return t`IP addresses with most messages`;
  },
  get tokens() {
    return t`IP addresses with most tokens`;
  },
};

const tenantTitles: Record<UsageStatsMetric, string> = {
  get conversations() {
    return t`Tenants with most conversations`;
  },
  get messages() {
    return t`Tenants with most messages`;
  },
  get tokens() {
    return t`Tenants with most tokens`;
  },
};

const buildSourceQuery = (opts: StatsFilters & ChartDataSources) =>
  buildSourceBreakoutQuery({ ...opts, breakoutColumn: "source_name" });

const buildProfileQuery = (opts: StatsFilters & ChartDataSources) =>
  buildSourceBreakoutQuery({ ...opts, breakoutColumn: "profile_name" });

const buildUserQuery = (opts: StatsFilters & ChartDataSources) =>
  buildSourceBreakoutQuery({ ...opts, breakoutColumn: "user_display_name" });

const buildIpAddressQuery = (opts: StatsFilters & ChartDataSources) =>
  buildSourceBreakoutQuery({ ...opts, breakoutColumn: "ip_address" });

const labelUnknownIpAddress = (value: unknown) =>
  value == null ? t`Unknown` : value;

export function ConversationStatsPage({ location }: WithRouterProps) {
  const dispatch = useDispatch();
  const [{ date, user, group, tenant, metric }, { patchUrlState }] =
    useUrlState(location, statsUrlStateConfig);

  const {
    dateFilter,
    userId,
    groupId,
    tenantId,
    userOptions,
    groupOptions,
    tenantOptions,
    hasTenants,
  } = useFilterOptions({ date, user, group, tenant });

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

  const tenantNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const opt of tenantOptions) {
      map.set(opt.value, opt.label);
    }
    return map;
  }, [tenantOptions]);

  const labelTenantName = useCallback(
    (value: unknown) =>
      value == null
        ? value
        : (tenantNameById.get(String(value)) ?? String(value)),
    [tenantNameById],
  );

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
    (value: string) => {
      const dateStr = dayjs(value).format("YYYY-MM-DD");
      navigateToConversations({ date: dateStr });
    },
    [navigateToConversations],
  );

  const handleUserClick = useCallback(
    (displayName: string) => {
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
          <BreakoutChart
            {...sharedChartProps}
            titles={sourceTitles}
            display="bar"
            buildQuery={buildSourceQuery}
          />
          <BreakoutChart
            {...sharedChartProps}
            titles={profileTitles}
            display="bar"
            buildQuery={buildProfileQuery}
          />
        </SimpleGrid>

        <SimpleGrid cols={hasTenants ? 2 : 3} spacing="lg">
          {hasTenants && (
            <BreakoutChart
              {...sharedChartProps}
              titles={tenantTitles}
              display="row"
              buildQuery={buildTenantBreakoutQuery}
              labelMapper={labelTenantName}
              h={500}
            />
          )}
          <BreakoutChart
            {...sharedChartProps}
            titles={groupTitles}
            display="row"
            buildQuery={buildGroupBreakoutQuery}
            h={500}
          />
          <BreakoutChart
            {...sharedChartProps}
            titles={userTitles}
            display="row"
            buildQuery={buildUserQuery}
            onDimensionClick={handleUserClick}
            h={500}
          />
          <BreakoutChart
            {...sharedChartProps}
            titles={ipAddressTitles}
            display="row"
            buildQuery={buildIpAddressQuery}
            labelMapper={labelUnknownIpAddress}
            h={500}
          />
        </SimpleGrid>
      </SettingsPageWrapper>
    </MetabotAdminLayout>
  );
}
