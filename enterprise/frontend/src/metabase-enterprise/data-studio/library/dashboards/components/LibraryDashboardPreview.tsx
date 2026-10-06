import DashboardS from "metabase/css/dashboard.module.css";
import { Dashboard } from "metabase/dashboard/components/Dashboard";
import { FixedWidthContainer } from "metabase/dashboard/components/Dashboard/DashboardComponents";
import {
  DashboardContextProvider,
  useDashboardContext,
} from "metabase/dashboard/context";
import { Box, Center, Loader, Stack } from "metabase/ui";
import type { DashboardId } from "metabase-types/api";

type LibraryDashboardPreviewProps = {
  dashboardId: DashboardId;
  className?: string;
};

/** A read-only render of the dashboard: tabs, filters, and cards. */
export function LibraryDashboardPreview({
  dashboardId,
  className,
}: LibraryDashboardPreviewProps) {
  return (
    <DashboardContextProvider
      dashboardId={dashboardId}
      navigateToNewCardFromDashboard={null}
      dashcardMenu={null}
      dashboardActions={[]}
    >
      <LibraryDashboardPreviewContent className={className} />
    </DashboardContextProvider>
  );
}

function LibraryDashboardPreviewContent({ className }: { className?: string }) {
  const { dashboard } = useDashboardContext();

  if (!dashboard) {
    return (
      <Center className={className}>
        <Loader />
      </Center>
    );
  }

  const hasTabs = (dashboard.tabs?.length ?? 0) > 1;
  const hasParameters = (dashboard.parameters?.length ?? 0) > 0;
  // fixed-width dashboards center their grid; keep tabs and filters aligned
  const isFixedWidth = dashboard.width === "fixed";

  // The wrapper owns the frame and padding, so dashboard styles can't override them
  return (
    <Box className={className}>
      <Stack className={DashboardS.Dashboard} gap={0} mih="100%">
        {hasTabs && (
          // The tabs pull the next element up under their underline with a
          // -2px margin (meant for the dashboard header); the padding here
          // absorbs that and spaces the tabs from the cards.
          <FixedWidthContainer isFixedWidth={isFixedWidth} pb="md">
            <Dashboard.Tabs />
          </FixedWidthContainer>
        )}
        {hasParameters && (
          <FixedWidthContainer isFixedWidth={isFixedWidth} pb="md">
            <Dashboard.ParametersList />
          </FixedWidthContainer>
        )}
        {/*
          The grid must sit in a block container: fixed-width dashboards center
          it with `margin: 0 auto`, which in a flex column would shrink it to its
          (initially empty) content, so it measures 0px wide and never renders.
        */}
        <Box>
          <Dashboard.Grid />
        </Box>
      </Stack>
    </Box>
  );
}
