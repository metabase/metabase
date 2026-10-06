import type { ReactNode } from "react";

import { skipToken, useGetDashboardQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { usePageTitle } from "metabase/hooks/use-page-title";
import { useParams } from "metabase/router";
import { Center } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { Dashboard } from "metabase-types/api";

import { LibraryDashboardHeader } from "./LibraryDashboardHeader";

type LibraryDashboardPageProps = {
  "data-testid"?: string;
  children: (dashboard: Dashboard) => ReactNode;
};

/** Loads the dashboard from the route and frames a tab of its detail page. */
export function LibraryDashboardPage({
  "data-testid": dataTestId,
  children,
}: LibraryDashboardPageProps) {
  const params = useParams<{ dashboardId: string }>();
  const dashboardId = Urls.extractEntityId(params.dashboardId);
  const {
    data: dashboard,
    isLoading,
    error,
  } = useGetDashboardQuery(
    dashboardId != null ? { id: dashboardId } : skipToken,
  );

  usePageTitle(dashboard?.name ?? "");

  if (isLoading || error != null || dashboard == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return (
    <PageContainer data-testid={dataTestId}>
      <LibraryDashboardHeader dashboard={dashboard} />
      {children(dashboard)}
    </PageContainer>
  );
}
