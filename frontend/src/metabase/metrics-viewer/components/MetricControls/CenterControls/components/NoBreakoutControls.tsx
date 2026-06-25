import cx from "classnames";
import { t } from "ttag";

import { useMetricsViewerContext } from "metabase/metrics-viewer/context";
import { Box, Button, Flex, Icon } from "metabase/ui";

import S from "../CenterControls.module.css";

export function NoBreakoutControls() {
  const { openSidebar } = useMetricsViewerContext();

  return (
    <Flex className={cx(S.centerCluster, S.noBreakout)}>
      <Flex className={S.centerControls} align="center">
        <Box className={S.controlSection}>
          <Button
            className={S.controlButton}
            fw="bold"
            aria-label={t`No breakout`}
            variant="subtle"
            color="text-primary"
            leftSection={<Icon c="brand" name="unreferenced" size={16} />}
            onClick={openSidebar}
          >
            {t`No breakout`}
          </Button>
        </Box>
      </Flex>
    </Flex>
  );
}
