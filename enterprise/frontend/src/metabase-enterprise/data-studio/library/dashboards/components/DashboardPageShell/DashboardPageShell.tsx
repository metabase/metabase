import type { ReactNode } from "react";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { Center } from "metabase/ui";
import type { Dashboard } from "metabase-types/api";

import { useRouteDashboard } from "../../hooks/use-route-dashboard";
import { DashboardHeader } from "../DashboardHeader";

type DashboardPageShellProps = {
  "data-testid"?: string;
  children: (dashboard: Dashboard) => ReactNode;
};

/**
 * Loads the dashboard in the route and frames a Data Studio dashboard page
 * with its header. Renders a loader or the error until the dashboard is
 * there, then `children` with it.
 */
export function DashboardPageShell({
  "data-testid": dataTestId,
  children,
}: DashboardPageShellProps) {
  const { dashboard, isLoading, error } = useRouteDashboard();

  if (isLoading || error != null || dashboard == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return (
    <PageContainer data-testid={dataTestId}>
      <DashboardHeader dashboard={dashboard} />
      {children(dashboard)}
    </PageContainer>
  );
}
