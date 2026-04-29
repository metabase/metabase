import dayjs from "dayjs";
import { useCallback, useMemo } from "react";
import type { WithRouterProps } from "react-router";
import { push } from "react-router-redux";
import { t } from "ttag";

import { SettingsPageWrapper } from "metabase/admin/components/SettingsSection";
import { getErrorMessage } from "metabase/api/utils";
import { useToast } from "metabase/common/hooks";
import { useUrlState } from "metabase/common/hooks/use-url-state";
import { MetabotAdminLayout } from "metabase/metabot/components/MetabotAdmin/MetabotAdminLayout";
import { serializeDateParameterValue } from "metabase/querying/parameters/utils/parsing";
import { useDispatch } from "metabase/redux";
import { Button, Flex, SimpleGrid, Tabs, Title } from "metabase/ui";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { useRefreshDataComplexityScoresMutation } from "../../api";
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
import {
  ConversationsByDayChart,
  isSingleDayFilter,
} from "./ConversationsByDayChart";
import { DataComplexityCards } from "./DataComplexityCards";
import {
  type StatsFilters,
  type UsageStatsMetric,
  buildGroupBreakoutQuery,
  buildSourceBreakoutQuery,
  buildTenantBreakoutQuery,
  tableForMetric,
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
    groupNoFilterValue,
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
    table: tableForMetric(
      metric,
      conversationsAudit.table,
      usageLogAudit.table,
    ),
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
      const bucketStart = dayjs(value);
      const dateStr = isSingleDayFilter(dateFilter)
        ? serializeDateParameterValue({
            type: "specific",
            operator: "between",
            values: [bucketStart.toDate(), bucketStart.add(1, "hour").toDate()],
            hasTime: true,
          })
        : bucketStart.format("YYYY-MM-DD");

      navigateToConversations({ date: dateStr });
    },
    [dateFilter, navigateToConversations],
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

  const handleGroupClick = useCallback(
    (groupName: string) => {
      const match = groupOptions.find((opt) => opt.label === groupName);
      if (match) {
        navigateToConversations({ group: match.value });
      }
    },
    [groupOptions, navigateToConversations],
  );

  const handleTenantClick = useCallback(
    (tenantName: string) => {
      const match = tenantOptions.find((opt) => opt.label === tenantName);
      if (match) {
        navigateToConversations({ tenant: match.value });
      }
    },
    [navigateToConversations, tenantOptions],
  );

  return (
    <MetabotAdminLayout fullWidth>
      <SettingsPageWrapper mt="sm" title={t`Usage stats`}>
        <DataComplexitySection />
        <Flex align="center" justify="space-between">
          <Title order={3} display="flex" style={{ alignItems: "center" }}>
            {t`Usage metrics`}
          </Title>

          <ConversationFilters
            date={date}
            onDateChange={(val) => patchUrlState({ date: val })}
            user={user}
            onUserChange={(val) => patchUrlState({ user: val })}
            group={group}
            onGroupChange={(val) => patchUrlState({ group: val })}
            groupNoFilterValue={groupNoFilterValue}
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
              onDimensionClick={handleTenantClick}
              h={500}
            />
          )}
          <BreakoutChart
            {...sharedChartProps}
            titles={groupTitles}
            display="row"
            buildQuery={(opts) =>
              buildGroupBreakoutQuery({ ...opts, excludeAllUsers: !hasTenants })
            }
            onDimensionClick={handleGroupClick}
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

export function DataComplexitySection() {
  const hasDataComplexityFeature = hasPremiumFeature("data-complexity-score");

  if (!hasDataComplexityFeature) {
    return null;
  }

  return (
    <>
      <DataComplexityHeader />
      <DataComplexityCards />
    </>
  );
}

export function DataComplexityHeader() {
  const [
    refreshDataComplexityScores,
    { isLoading: refreshDataComplexityScoresLoading },
  ] = useRefreshDataComplexityScoresMutation();
  const [sendToast] = useToast();

  const handleRecompute = useCallback(async () => {
    try {
      await refreshDataComplexityScores().unwrap();
    } catch (error) {
      sendToast({
        icon: "warning",
        toastColor: "error",
        message: getErrorMessage(
          error,
          t`Could not recompute data complexity.`,
        ),
      });
    }
  }, [refreshDataComplexityScores, sendToast]);

  return (
    <Flex align="center" justify="space-between">
      <Title order={3} display="flex" style={{ alignItems: "center" }}>
        {t`Data complexity`}
      </Title>

      <Flex gap="sm" wrap="wrap" align="center">
        <Button
          variant="default"
          onClick={handleRecompute}
          loading={refreshDataComplexityScoresLoading}
          disabled={refreshDataComplexityScoresLoading}
        >
          {t`Recompute`}
        </Button>
      </Flex>
    </Flex>
  );
}
