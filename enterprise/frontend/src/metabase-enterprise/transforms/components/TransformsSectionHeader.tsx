import type { ReactNode } from "react";

import { PLUGIN_METABOT } from "metabase/plugins";
import { Box, Flex, type FlexProps } from "metabase/ui";

type TransformsSectionHeaderProps = {
  leftSection?: ReactNode;
} & FlexProps;

export const TransformsSectionHeader = ({
  leftSection: breadcrumbs,
  ...flexProps
}: TransformsSectionHeaderProps) => {
  return (
    <Flex my="md" {...flexProps}>
      {breadcrumbs}
      <Box ml="auto">
        <PLUGIN_METABOT.MetabotDataStudioButton />
      </Box>
    </Flex>
  );
};
