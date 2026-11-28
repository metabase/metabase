import { type ComponentProps, memo } from "react";

import { FixedSizeIcon, Group, Text } from "metabase/ui";
import type { ColorName } from "metabase/ui/colors/types";
import { Ellipsified } from "metabase/ui/components/data-display/Ellipsified";
import type { IconName } from "metabase-types/api/icon";

import { type IconComponent, StaticIcon } from "../../../icons/Icon/StaticIcon";

interface EntityNameCellProps {
  icon?: IconName | IconComponent;
  name: React.ReactNode;
  iconColor?: ColorName;
  nameColor?: ColorName;
  wrap?: boolean;
  ellipsifiedProps?: ComponentProps<typeof Ellipsified>;
  tooltipOpenDelay?: number;
  "data-testid"?: string;
}

export const EntityNameCell = memo(function EntityNameCell({
  icon,
  name,
  iconColor = "core-brand",
  nameColor,
  wrap = false,
  tooltipOpenDelay = 600,
  ellipsifiedProps,
  "data-testid": testId,
}: EntityNameCellProps) {
  return (
    <Group data-testid={testId} gap="sm" wrap="nowrap" miw={0}>
      {typeof icon === "string" ? (
        <FixedSizeIcon name={icon} c={iconColor} />
      ) : (
        icon && (
          <StaticIcon
            component={icon}
            c={iconColor}
            flex="0 0 1rem"
            aria-hidden
          />
        )
      )}
      {wrap ? (
        <Text c={nameColor} flex={1} miw={0}>
          {name}
        </Text>
      ) : (
        <Ellipsified
          c={nameColor}
          flex={1}
          miw={0}
          tooltipProps={{ openDelay: tooltipOpenDelay }}
          {...ellipsifiedProps}
        >
          {name}
        </Ellipsified>
      )}
    </Group>
  );
});
