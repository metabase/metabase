import { Ellipsified } from "metabase/common/components/Ellipsified";
import type { IconName } from "metabase/ui";
import { Group, Icon, Text } from "metabase/ui";

import S from "./EntityNameCell.module.css";

interface EntityNameCellProps {
  icon?: IconName;
  name: string;
  iconColor?: string;
  wrap?: boolean;
  tooltipOpenDelay?: number;
  "data-testid"?: string;
}

export function EntityNameCell({
  icon,
  name,
  iconColor = "brand",
  wrap = false,
  tooltipOpenDelay = 600,
  "data-testid": testId,
}: EntityNameCellProps) {
  return (
    <Group data-testid={testId} gap="sm" wrap="nowrap" miw={0}>
      {icon && <Icon name={icon} c={iconColor} className={S.icon} />}
      {wrap ? (
        <Text flex={1} miw={0}>
          {name}
        </Text>
      ) : (
        <Ellipsified flex={1} miw={0} tooltipOpenDelay={tooltipOpenDelay}>
          {name}
        </Ellipsified>
      )}
    </Group>
  );
}
