import type { ReactNode } from "react";

import { PLUGIN_METABOT } from "metabase/plugins";
import { Box, Flex } from "metabase/ui";

interface TransformsSectionHeaderProps {
  leftSection?: ReactNode;
}

export const TransformsSectionHeader = ({
  leftSection: breadcrumbs,
}: TransformsSectionHeaderProps) => {
  return (
    <Flex px="3.5rem" my="md">
      {breadcrumbs}
      <Box ml="auto">
        <PLUGIN_METABOT.MetabotDataStudioButton />
      </Box>
    </Flex>
  );
};
