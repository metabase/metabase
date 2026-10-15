import type { ReactNode } from "react";

import CS from "metabase/css/core/bordered.module.css";
import { Box, Flex, Icon, Text } from "metabase/ui";
import type { ColorName } from "metabase/ui/colors/types";
import type { IconName } from "metabase-types/api";

interface SyncListRowProps {
  label: string;
  icon: IconName;
  iconColor?: ColorName;
  children: ReactNode;
}

export const SyncListRow = ({
  label,
  icon,
  iconColor = "text-secondary",
  children,
}: SyncListRowProps) => (
  <Box p="lg" className={CS.borderRowDivider}>
    <Flex justify="space-between" align="center">
      <Flex align="center" gap="sm">
        <Icon name={icon} c={iconColor} />
        <Text fw="medium">{label}</Text>
      </Flex>
      <Flex align="center" gap="sm">
        {children}
      </Flex>
    </Flex>
  </Box>
);
