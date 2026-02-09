import type { ReactNode } from "react";

import { PLUGIN_METABOT } from "metabase/plugins";
import { Flex, Stack } from "metabase/ui";

type SectionLayoutProps = {
  children?: ReactNode;
};

export function SectionLayout({ children }: SectionLayoutProps) {
  return (
    <Stack h="100%" gap={0} bg="background-secondary">
      <Flex flex={1} mih={0} miw={0}>
        <Stack flex={1} miw={0} gap={0}>
          {children}
        </Stack>
        <PLUGIN_METABOT.MetabotDataStudioSidebar />
      </Flex>
    </Stack>
  );
}
