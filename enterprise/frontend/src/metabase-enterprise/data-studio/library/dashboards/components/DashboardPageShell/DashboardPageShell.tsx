import { useElementSize } from "@mantine/hooks";
import type { ReactNode } from "react";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { Center, Flex, Skeleton } from "metabase/ui";
import type { Dashboard } from "metabase-types/api";

import { DataStudioPageSkeleton } from "../../../components/DataStudioPageSkeleton";
import {
  type DashboardTabsInfo,
  useDashboardTabsInfo,
} from "../../hooks/use-dashboard-tabs-info";
import { useRouteDashboard } from "../../hooks/use-route-dashboard";
import { DashboardHeader } from "../DashboardHeader";

type RenderPage = (dashboard: Dashboard) => ReactNode;

type RenderAside = (dashboard: Dashboard, containerWidth: number) => ReactNode;

type DashboardPageShellProps = {
  "data-testid"?: string;
  children: RenderPage;
  aside?: RenderAside;
  /** Placeholder for the page body while the dashboard loads. */
  bodySkeleton?: ReactNode;
};

/**
 * Loads the dashboard in the route and what its tabs need, and frames a Data
 * Studio dashboard page with its header. Renders a skeleton or the error until
 * all of it is there, then `children` with the dashboard. `aside` renders beside the page, at its
 * edge, with the width the page is left with.
 */
export function DashboardPageShell({
  "data-testid": dataTestId,
  children,
  aside,
  bodySkeleton = <Skeleton flex={1} mih={400} radius="md" />,
}: DashboardPageShellProps) {
  const {
    dashboard,
    isLoading: isLoadingDashboard,
    error: dashboardError,
  } = useRouteDashboard();
  const {
    tabsInfo,
    isLoading: isLoadingTabsInfo,
    error: tabsInfoError,
  } = useDashboardTabsInfo(dashboard?.id);
  const isLoading = isLoadingDashboard || isLoadingTabsInfo;
  const error = dashboardError ?? tabsInfoError;

  if (isLoading) {
    return (
      <DataStudioPageSkeleton icon="dashboard" tabCount={5}>
        {bodySkeleton}
      </DataStudioPageSkeleton>
    );
  }

  if (error != null || dashboard == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper error={error} />
      </Center>
    );
  }

  if (aside != null) {
    return (
      <DashboardPageWithAside
        dashboard={dashboard}
        tabsInfo={tabsInfo}
        data-testid={dataTestId}
        aside={aside}
      >
        {children}
      </DashboardPageWithAside>
    );
  }

  return (
    <PageContainer data-testid={dataTestId}>
      <DashboardHeader dashboard={dashboard} tabsInfo={tabsInfo} />
      {children(dashboard)}
    </PageContainer>
  );
}

type DashboardPageWithAsideProps = {
  dashboard: Dashboard;
  tabsInfo: DashboardTabsInfo;
  "data-testid"?: string;
  children: RenderPage;
  aside: RenderAside;
};

function DashboardPageWithAside({
  dashboard,
  tabsInfo,
  "data-testid": dataTestId,
  children,
  aside,
}: DashboardPageWithAsideProps) {
  const { ref: containerRef, width: containerWidth } = useElementSize();

  return (
    <Flex h="100%" wrap="nowrap">
      <PageContainer
        ref={containerRef}
        flex={1}
        miw={0}
        data-testid={dataTestId}
      >
        <DashboardHeader dashboard={dashboard} tabsInfo={tabsInfo} />
        {children(dashboard)}
      </PageContainer>
      {aside(dashboard, containerWidth)}
    </Flex>
  );
}
