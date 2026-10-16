import { useElementSize } from "@mantine/hooks";
import type { ReactNode } from "react";

import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { Flex } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { Dashboard } from "metabase-types/api";

import { LibraryItemHeader } from "../../../components/LibraryItemHeader";
import { LibraryItemPageState } from "../../../components/LibraryItemPageState";
import { useDashboardTabsInfo } from "../../hooks/use-dashboard-tabs-info";
import { useRouteDashboard } from "../../hooks/use-route-dashboard";

import { DashboardHeaderActions } from "./DashboardHeaderActions";
import { DashboardTabs } from "./DashboardTabs";

type DashboardPageShellProps = {
  "data-testid": string;
  children: (dashboard: Dashboard) => ReactNode;
  aside?: (dashboard: Dashboard, containerWidth: number) => ReactNode;
};

export function DashboardPageShell({
  "data-testid": dataTestId,
  children,
  aside,
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
  const { ref: containerRef, width: containerWidth } = useElementSize();

  return (
    <LibraryItemPageState
      model="dashboard"
      item={dashboard}
      isLoading={isLoadingDashboard || isLoadingTabsInfo}
      error={dashboardError ?? tabsInfoError}
      getItemUrl={Urls.dashboard}
    >
      {(dashboard, folders) => (
        <Flex h="100%" wrap="nowrap">
          <PageContainer
            ref={containerRef}
            flex={1}
            miw={0}
            data-testid={dataTestId}
          >
            <LibraryItemHeader
              model="dashboard"
              item={dashboard}
              folders={folders}
              tabs={
                <DashboardTabs dashboardId={dashboard.id} tabsInfo={tabsInfo} />
              }
              actions={<DashboardHeaderActions dashboard={dashboard} />}
            />
            {children(dashboard)}
          </PageContainer>
          {aside?.(dashboard, containerWidth)}
        </Flex>
      )}
    </LibraryItemPageState>
  );
}
