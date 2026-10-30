import { useState } from "react";

import { Box, Center, Flex, Icon, Tooltip } from "metabase/ui";
import type { ColorName } from "metabase/ui/colors/types";

import type { PermissionOption } from "../../types";

interface PermissionsSelectOptionProps extends Omit<PermissionOption, "value"> {
  className?: string;
  c?: ColorName;
  hint?: string | null;
}

export function PermissionsSelectOption({
  label,
  icon,
  iconColor,
  className,
  c,
  hint,
}: PermissionsSelectOptionProps) {
  const [shouldShowTooltip, setShouldShowTooltip] = useState(false);

  return (
    <Flex
      className={className}
      align="center"
      w="100%"
      c={c}
      onMouseEnter={() => setShouldShowTooltip(true)}
      onMouseLeave={() => setShouldShowTooltip(false)}
    >
      <Tooltip label={hint} disabled={!hint} opened={shouldShowTooltip}>
        <Center flex="0 0 auto" w="1.25rem" h="1.25rem" c={iconColor}>
          <Icon name={icon} />
        </Center>
      </Tooltip>
      <Box fz="md" px="sm">
        {label}
      </Box>
    </Flex>
  );
}
