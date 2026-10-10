import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { Box, Center, Flex, Stack } from "metabase/ui";

import { DashboardHeader } from "../../components/DashboardHeader";
import { useRouteDashboard } from "../../hooks/use-route-dashboard";

import { DashboardInfo } from "./DashboardInfo";
import S from "./DashboardOverviewPage.module.css";
import { DashboardPreview } from "./DashboardPreview";

export function DashboardOverviewPage() {
  const { dashboard, isLoading, error } = useRouteDashboard();

  if (isLoading || error != null || dashboard == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return (
    <PageContainer data-testid="dashboard-overview-page">
      <DashboardHeader dashboard={dashboard} />
      <Flex flex={1} gap={0} mih={0}>
        <Box className={S.preview} flex={1} miw={0}>
          <DashboardPreview dashboard={dashboard} />
        </Box>
        <Stack className={S.infoPanel} flex="0 0 360px">
          <DashboardInfo dashboard={dashboard} />
        </Stack>
      </Flex>
    </PageContainer>
  );
}
