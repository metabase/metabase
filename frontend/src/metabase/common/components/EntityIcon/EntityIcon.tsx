import type { CSSProperties, HTMLAttributes, ImgHTMLAttributes } from "react";

import { Icon, type IconProps } from "metabase/ui";
import type { ColorName } from "metabase/ui/colors";
import { color as colorValue } from "metabase/ui/utils/colors";
import type { IconData } from "metabase/utils/icon";

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
  color = "brand",
  style,
  alt = "",
  ...rest
}: EntityIconProps) {
  if (iconUrl) {
    const bg = color === "inherit" ? "currentColor" : colorValue(color);

    return (
      <span
        role={alt ? "img" : undefined}
        aria-label={alt || undefined}
        aria-hidden={alt ? undefined : "true"}
        style={{
          ...style,
          display: "inline-block",
          verticalAlign: "middle",
          width: size,
          height: size,
          backgroundColor: bg,
          maskImage: `url(${iconUrl})`,
          maskSize: "contain",
          maskRepeat: "no-repeat",
          maskPosition: "center",
        }}
        {...(rest as HTMLAttributes<HTMLSpanElement>)}
      />
    );
  }

  return <Icon name={name} size={size} c={color} style={style} {...rest} />;
}
