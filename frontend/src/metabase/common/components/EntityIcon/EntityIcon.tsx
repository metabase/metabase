import type { CSSProperties, ImgHTMLAttributes } from "react";

import type { IconData } from "metabase/lib/icon";
import { Icon, type IconProps } from "metabase/ui";
import type { ColorName } from "metabase/ui/colors";

export type EntityIconProps = Omit<IconProps, "name" | "color"> & {
  name?: IconData["name"];
  iconUrl?: string;
  color?: ColorName | "inherit";
  size?: string | number;
  style?: CSSProperties;
  alt?: string;
} & Omit<ImgHTMLAttributes<HTMLImageElement>, keyof IconProps>;

/**
 * Renders either a custom visualization icon (via iconUrl) or a standard
 * Metabase Icon (via name).  Drop-in replacement for `<Icon {...iconData} />`
 * wherever iconUrl may be present.
 */
export function EntityIcon({
  iconUrl,
  name = "unknown",
  size = "1rem",
  color,
  style,
  alt = "",
  ...rest
}: EntityIconProps) {
  if (iconUrl) {
    return (
      <img
        {...(rest as ImgHTMLAttributes<HTMLImageElement>)}
        aria-hidden={alt ? undefined : "true"}
        src={iconUrl}
        alt={alt}
        style={{ ...style, width: size, height: size }}
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
