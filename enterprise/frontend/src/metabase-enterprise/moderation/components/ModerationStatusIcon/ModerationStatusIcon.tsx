import { color } from "metabase/lib/colors";
import { getStatusIcon } from "metabase-enterprise/moderation/service";

import type { IconProps } from "metabase/core/components/Icon";
import { Icon } from "metabase/core/components/Icon";

type ModerationStatusIconProps = {
  status: string | null | undefined;
} & Partial<IconProps>;

export const ModerationStatusIcon = ({
  status,
  ...iconProps
}: ModerationStatusIconProps) => {
  const { name: iconName, color: iconColor } = getStatusIcon(status);
  return iconName ? (
    <Icon name={iconName} color={color(iconColor)} {...iconProps} />
  ) : null;
};
