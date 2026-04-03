import type { CSSProperties } from "react";

import type { IconData } from "metabase/lib/icon";
import { Icon, type IconProps } from "metabase/ui";
import type { ColorName } from "metabase/ui/colors";

export type EntityIconProps = Omit<IconProps, "name" | "color"> & {
  name?: IconData["name"];
  iconUrl?: string;
  color?: ColorName | "inherit";
  size?: number;
  style?: CSSProperties;
};

/**
 * Renders either a custom visualization icon (via iconUrl) or a standard
 * Metabase Icon (via name).  Drop-in replacement for `<Icon {...iconData} />`
 * wherever iconUrl may be present.
 */
export function EntityIcon({
  iconUrl,
  name = "unknown",
  size = 16,
  color,
  style,
  ...rest
}: EntityIconProps) {
  if (iconUrl) {
    return (
      <img
        src={iconUrl}
        alt=""
        width={size}
        height={size}
        style={style}
        aria-hidden="true"
      />
    );
  }

  return (
    <Icon
      name={name}
      size={size}
      color={color as ColorName}
      style={style}
      {...rest}
    />
  );
}
