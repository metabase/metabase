import { getStatusIcon } from "metabase-enterprise/moderation/service";
import type { IconProps } from "metabase/ui";
import { FixedSizeIcon } from "metabase/ui";

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
    <FixedSizeIcon name={iconName} c={iconColor} {...reformattedIconProps} />
  );
};
