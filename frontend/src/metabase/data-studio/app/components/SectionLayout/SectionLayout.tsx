import type { ReactNode } from "react";

import { MetabotDataStudioSidebar } from "metabase/metabot/components/MetabotDataStudioSidebar";
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
        <MetabotDataStudioSidebar />
      </Flex>
    </Stack>
  );
}
