import type { ReactNode } from "react";

import { PLUGIN_METABOT } from "metabase/plugins";
import { Box, Flex, Stack } from "metabase/ui";

type SectionLayoutProps = {
  children?: ReactNode;
};

export function SectionLayout({ children }: SectionLayoutProps) {
  return (
    <Stack h="100%" gap={0} bg="bg-light">
      <Flex flex={1} mih={0} miw={0}>
        <Box flex={1} miw={0}>
          {children}
        </Box>
        <PLUGIN_METABOT.MetabotDataStudioSidebar />
      </Flex>
    </Stack>
  );
}
