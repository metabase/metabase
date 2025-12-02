import type { Location } from "history";
import type { ReactNode } from "react";
import { t } from "ttag";

import { usePageTitle } from "metabase/hooks/use-page-title";
import { PLUGIN_METABOT } from "metabase/plugins";
import { Box, Flex, Stack } from "metabase/ui";

type TransformsSectionLayoutProps = {
  location: Location;
  children?: ReactNode;
};

export function TransformsSectionLayout({
  children,
}: TransformsSectionLayoutProps) {
  usePageTitle(t`Transforms`);

  return (
    <Stack h="100%" gap={0}>
      <Flex flex={1} mih={0} miw={0}>
        <Box flex={1} miw={0}>
          {children}
        </Box>
        <PLUGIN_METABOT.MetabotDataStudioSidebar />
      </Flex>
    </Stack>
  );
}
