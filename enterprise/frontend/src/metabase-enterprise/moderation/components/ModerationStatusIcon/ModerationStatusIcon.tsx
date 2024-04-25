import { color } from "metabase/lib/colors";
import type { IconProps } from "metabase/ui";
import { Icon } from "metabase/ui";
import { getStatusIcon } from "metabase-enterprise/moderation/service";

type ModerationStatusIconProps = {
  status: string | null | undefined;
  filled?: boolean;
} & Partial<IconProps>;

export const ModerationStatusIcon = ({
  status,
  filled = false,
  ...iconProps
}: ModerationStatusIconProps) => {
  const { name: iconName, color: iconColor } = getStatusIcon(status, filled);
  return iconName ? (
    <Icon name={iconName} color={color(iconColor)} {...iconProps} />
  ) : null;
};
