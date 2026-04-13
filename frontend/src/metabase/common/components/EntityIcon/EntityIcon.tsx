import type { CSSProperties, ImgHTMLAttributes } from "react";

import { Icon, type IconProps, useMantineTheme } from "metabase/ui";
import type { ColorName } from "metabase/ui/colors";
import type { IconData } from "metabase/utils/icon";

export type EntityIconProps = Omit<IconProps, "name" | "color"> & {
  name?: IconData["name"];
  iconUrl?: string;
  iconDarkUrl?: string;
  // `(string & {})` keeps `ColorName` autocompletion while still allowing
  // arbitrary CSS color strings such as hex codes or CSS variables.
  color?: ColorName | "inherit" | (string & {});
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
  iconDarkUrl,
  name = "unknown",
  size = "1rem",
  color,
  style,
  alt = "",
  ...rest
}: EntityIconProps) {
  const theme = useMantineTheme();
  const isDarkMode = theme.other.colorScheme === "dark";
  const resolvedIconUrl = isDarkMode ? (iconDarkUrl ?? iconUrl) : iconUrl;

  if (resolvedIconUrl) {
    // color is intentionally not applied — CSS color has no effect on <img>
    return (
      <img
        aria-hidden={alt ? undefined : "true"}
        src={resolvedIconUrl}
        alt={alt}
        style={{ ...style, width: size, height: size }}
        {...(rest as ImgHTMLAttributes<HTMLImageElement>)}
      />
    );
  }

  return <Icon name={name} size={size} c={color} style={style} {...rest} />;
}
