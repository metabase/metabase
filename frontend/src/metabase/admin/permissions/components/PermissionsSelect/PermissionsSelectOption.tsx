import { useState } from "react";

import CS from "metabase/css/core/index.css";
import type { ColorName } from "metabase/lib/colors/types";
import {
  Box,
  Center,
  Group,
  Icon,
  Tooltip,
  isValidIconName,
} from "metabase/ui";

import type { PermissionOption } from "../../types";

interface PermissionsSelectOptionProps extends Omit<PermissionOption, "value"> {
  className?: string;
  hint?: string | null;
}

export function PermissionsSelectOption({
  label,
  icon,
  iconColor,
  className,
  hint,
}: PermissionsSelectOptionProps) {
  const [shouldShowTooltip, setShouldShowTooltip] = useState(false);

  return (
    <Group
      align="center"
      gap={0}
      w="100%"
      className={className}
      onMouseEnter={() => setShouldShowTooltip(true)}
      onMouseLeave={() => setShouldShowTooltip(false)}
    >
      {isValidIconName(icon) && (
        <Tooltip label={hint} disabled={!hint} opened={shouldShowTooltip}>
          <Center
            bg={iconColor as ColorName}
            c="text-primary-inverse"
            w={20}
            h={20}
            bdrs={3}
            className={CS.flexNoShrink}
          >
            <Icon name={icon} />
          </Center>
        </Tooltip>
      )}
      <Box fz="14px" fw="700" px="0.5rem">
        {label}
      </Box>
    </Group>
  );
}
