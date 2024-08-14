import { color } from "metabase/lib/colors";
import type { IconProps } from "metabase/ui";
import { FixedSizeIcon } from "metabase/ui";
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
  const { name: iconName, color: iconColor } = getStatusIcon(
    status ?? null,
    filled,
  );
  if (!iconName) {
    return null;
  }
  const reformattedIconProps = {
    ...iconProps,
    size:
      typeof iconProps.size === "string"
        ? parseInt(iconProps.size)
        : iconProps.size,
  };
  return (
    <FixedSizeIcon
      name={iconName}
      color={color(iconColor)}
      {...reformattedIconProps}
    />
  );
};
