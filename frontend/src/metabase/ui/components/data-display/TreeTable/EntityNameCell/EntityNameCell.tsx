import { type ComponentProps, memo } from "react";

import { Ellipsified } from "metabase/common/components/Ellipsified";
import CS from "metabase/css/core/index.css";
import type { ColorName } from "metabase/lib/colors/types";
import type { IconName } from "metabase/ui";
import { Group, Icon, Text } from "metabase/ui";

interface EntityNameCellProps {
  icon?: IconName;
  name: React.ReactNode;
  iconColor?: ColorName;
  wrap?: boolean;
  ellipsifiedProps?: ComponentProps<typeof Ellipsified>;
  tooltipOpenDelay?: number;
  "data-testid"?: string;
}

export const EntityNameCell = memo(function EntityNameCell({
  icon,
  name,
  iconColor = "brand",
  wrap = false,
  tooltipOpenDelay = 600,
  ellipsifiedProps,
  "data-testid": testId,
}: EntityNameCellProps) {
  return (
    <Group data-testid={testId} gap="sm" wrap="nowrap" miw={0}>
      {icon && <Icon name={icon} c={iconColor} className={CS.flexNoShrink} />}
      {wrap ? (
        <Text flex={1} miw={0}>
          {name}
        </Text>
      ) : (
        <Ellipsified
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
