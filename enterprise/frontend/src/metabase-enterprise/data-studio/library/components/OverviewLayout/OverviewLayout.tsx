import type { ReactNode } from "react";

import { Box, Flex, Stack } from "metabase/ui";

import S from "./OverviewLayout.module.css";

const INFO_PANEL_WIDTH_PX = 360;

type OverviewLayoutProps = {
  preview: ReactNode;
  info: ReactNode;
};

export function OverviewLayout({ preview, info }: OverviewLayoutProps) {
  return (
    <Flex flex={1} gap={0} mih={0}>
      <Box className={S.preview} flex={1} miw={0}>
        {preview}
      </Box>
      <Stack className={S.infoPanel} flex={`0 0 ${INFO_PANEL_WIDTH_PX}px`}>
        {info}
      </Stack>
    </Flex>
  );
}
