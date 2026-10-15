import { Box, Flex, Stack } from "metabase/ui";

import { DashboardPageShell } from "../../components/DashboardPageShell";

import { DashboardInfo } from "./DashboardInfo";
import S from "./DashboardOverviewPage.module.css";
import { DashboardPreview } from "./DashboardPreview";

const INFO_PANEL_WIDTH_PX = 360;

export function DashboardOverviewPage() {
  return (
    <DashboardPageShell data-testid="dashboard-overview-page">
      {(dashboard) => (
        <Flex flex={1} gap={0} mih={0}>
          <Box className={S.preview} flex={1} miw={0}>
            <DashboardPreview dashboard={dashboard} />
          </Box>
          <Stack className={S.infoPanel} flex={`0 0 ${INFO_PANEL_WIDTH_PX}px`}>
            <DashboardInfo dashboard={dashboard} />
          </Stack>
        </Flex>
      )}
    </DashboardPageShell>
  );
}
