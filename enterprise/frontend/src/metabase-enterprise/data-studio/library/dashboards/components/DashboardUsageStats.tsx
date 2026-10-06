import cx from "classnames";
import { useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import DashboardS from "metabase/css/dashboard.module.css";
import { DashCard } from "metabase/dashboard/components/DashCard/DashCard";
import DashboardGridS from "metabase/dashboard/components/DashboardGrid.module.css";
import {
  DashboardContextProvider,
  useDashboardContext,
} from "metabase/dashboard/context";
import EmbedFrameS from "metabase/embedding/theme.module.css";
import { Box, Center, Loader, Stack, Text } from "metabase/ui";
import { GRID_WIDTH } from "metabase/utils/dashboard_grid";
import { isNotNull } from "metabase/utils/types";
import LegendS from "metabase/visualizations/components/Legend.module.css";
import { useGetAuditInfoQuery } from "metabase-enterprise/api";
import type { DashboardId } from "metabase-types/api";

/**
 * Entity ids of the dashcards to show from the "Dashboard overview" usage
 * analytics dashboard (resources/instance_analytics/.../dashboard_overview.yaml),
 * in display order.
 */
const USAGE_DASHCARD_ENTITY_IDS = [
  "bvo3bHzsPRHm4yNdGLkRD", // Dashboard views per month
  "8-R___ABOFNA--DmJNq_H", // Most active people on this dashboard
  "_8MUvI8zFhQ2_vzIf5kw3", // Recent activity on dashboard
];

const CHART_HEIGHT = 400;

type DashboardUsageStatsProps = {
  dashboardId: DashboardId;
  className?: string;
};

/**
 * Renders a few charts from the "Dashboard overview" usage analytics
 * dashboard, filtered to one dashboard the same way its Insights link does.
 */
export function DashboardUsageStats({
  dashboardId,
  className,
}: DashboardUsageStatsProps) {
  const { data: auditInfo, isLoading } = useGetAuditInfoQuery();
  const overviewDashboardId = auditInfo?.dashboard_overview;
  const parameterQueryParams = useMemo(
    () => ({ dashboard_id: String(dashboardId) }),
    [dashboardId],
  );

  if (isLoading) {
    return (
      <Center className={className}>
        <Loader />
      </Center>
    );
  }

  if (overviewDashboardId == null) {
    return (
      <Center className={className}>
        <Text c="text-secondary">
          {t`Usage analytics aren't available for this dashboard.`}
        </Text>
      </Center>
    );
  }

  return (
    <DashboardContextProvider
      dashboardId={overviewDashboardId}
      parameterQueryParams={parameterQueryParams}
      navigateToNewCardFromDashboard={null}
      dashcardMenu={null}
      dashboardActions={[]}
    >
      <DashboardUsageStatsContent className={className} />
    </DashboardContextProvider>
  );
}

/**
 * Stacks the usage dashcards full-width at a fixed height. The dashboard grid
 * derives row heights from its width, so the cards are rendered directly
 * rather than through it.
 */
function DashboardUsageStatsContent({ className }: { className?: string }) {
  const { dashboard } = useDashboardContext();

  const dashcards = useMemo(
    () =>
      USAGE_DASHCARD_ENTITY_IDS.map((entityId) =>
        dashboard?.dashcards.find(
          (dashcard) => dashcard.entity_id === entityId,
        ),
      ).filter(isNotNull),
    [dashboard],
  );

  if (!dashboard) {
    return (
      <Center className={className}>
        <Loader />
      </Center>
    );
  }

  return (
    <Stack className={cx(DashboardS.Dashboard, className)} gap="md">
      {dashcards.map((dashcard) => (
        <Box
          key={dashcard.id}
          h={CHART_HEIGHT}
          className={cx(
            DashboardS.DashCard,
            EmbedFrameS.DashCard,
            LegendS.DashCard,
            DashboardGridS.DashboardCardContainer,
          )}
        >
          <DashCard
            // fills the 400px container, as it fills its grid slot
            className={DashboardGridS.Card}
            dashcard={dashcard}
            gridItemWidth={GRID_WIDTH}
            totalNumGridCols={GRID_WIDTH}
            isTrashedOnRemove={false}
            autoScroll={false}
            onRemove={_.noop}
            onReplaceCard={_.noop}
            markNewCardSeen={_.noop}
            onReplaceAllDashCardVisualizationSettings={_.noop}
            onUpdateVisualizationSettings={_.noop}
            showClickBehaviorSidebar={_.noop}
            onEditVisualization={_.noop}
          />
        </Box>
      ))}
    </Stack>
  );
}
