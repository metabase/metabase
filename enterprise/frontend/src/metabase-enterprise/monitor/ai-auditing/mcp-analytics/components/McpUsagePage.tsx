import { t } from "ttag";

import { SimpleGrid, Stack, Title } from "metabase/ui";
import { buildCallsByDayByStatusQuery } from "metabase-enterprise/monitor/ai-auditing/mcp-analytics/query-utils";

import { useMcpAnalyticsContext } from "./McpAnalyticsSectionLayout";
import { McpBreakoutChart } from "./McpBreakoutChart";
import { McpCallsTimelineChart } from "./McpCallsTimelineChart";

export function McpUsagePage() {
  const { dataSources, chartFilters, hasErrors } = useMcpAnalyticsContext();

  return (
    <Stack gap="lg">
      <McpCallsTimelineChart
        {...dataSources}
        {...chartFilters}
        title={t`Calls by client over time`}
      />
      <SimpleGrid cols={2} spacing="lg">
        <McpBreakoutChart
          {...dataSources}
          {...chartFilters}
          title={t`Calls by tool`}
          display="pie"
          breakoutColumn="tool_name"
          h={500}
        />
        <McpBreakoutChart
          {...dataSources}
          {...chartFilters}
          title={t`Calls by user`}
          display="row"
          breakoutColumn="user_display_name"
          h={500}
        />
      </SimpleGrid>

      {hasErrors && (
        <>
          <Title order={3} mt="md">{t`Errors`}</Title>
          <McpCallsTimelineChart
            {...dataSources}
            {...chartFilters}
            title={t`Calls by status over time`}
            buildQuery={buildCallsByDayByStatusQuery}
          />
          <SimpleGrid cols={2} spacing="lg">
            <McpBreakoutChart
              {...dataSources}
              {...chartFilters}
              title={t`Errors by type`}
              display="pie"
              breakoutColumn="error_type"
              errorsOnly
              h={500}
            />
            <McpBreakoutChart
              {...dataSources}
              {...chartFilters}
              title={t`Errors by tool`}
              display="row"
              breakoutColumn="tool_name"
              errorsOnly
              h={500}
            />
          </SimpleGrid>
        </>
      )}
    </Stack>
  );
}
