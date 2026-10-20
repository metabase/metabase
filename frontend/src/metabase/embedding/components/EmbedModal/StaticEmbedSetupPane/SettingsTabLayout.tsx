import cx from "classnames";
import type { ReactNode } from "react";

import CS from "metabase/css/core/index.css";
import { Box, Flex, Stack } from "metabase/ui";

import S from "./SettingsTabLayout.module.css";

interface SettingsTabLayoutProps {
  settingsSlot: ReactNode;
  previewSlot: ReactNode;
}

export const SettingsTabLayout = ({
  settingsSlot,
  previewSlot,
}: SettingsTabLayoutProps): JSX.Element => {
  return (
    <Flex flex="1 1 auto" mih={0}>
      <Box
        className={cx(S.borderRight, CS.overflowYAuto)}
        flex="0 0 auto"
        w="21.6rem"
        p="xxl"
        bg="background_page-primary"
      >
        {settingsSlot}
      </Box>
      <Stack
        className={CS.overflowYAuto}
        w="100%"
        miw="50rem"
        pos="relative"
        align="flex-start"
        gap="lg"
        pt="lg"
        pr="xl"
        pb="xxl"
        pl="lg"
        bg="background_page-secondary"
      >
        {previewSlot}
      </Stack>
    </Flex>
  );
};
