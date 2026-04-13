import type { CSSProperties, ImgHTMLAttributes } from "react";

import { Icon, type IconProps, useMantineTheme } from "metabase/ui";
import type { ColorName } from "metabase/ui/colors";
import type { IconData } from "metabase/utils/icon";
import type { VisualizationIconComponent } from "metabase/visualizations/types/visualization";

export type EntityIconProps = Omit<IconProps, "name" | "color"> & {
  name?: IconData["name"];
  iconUrl?: string;
  iconDarkUrl?: string;
  IconComponent?: VisualizationIconComponent;
  color?: ColorName | "inherit";
  size?: string | number;
  style?: CSSProperties;
  alt?: string;
} & Omit<ImgHTMLAttributes<HTMLImageElement>, keyof IconProps>;

/**
 * Renders either a themeable custom-viz icon component, a URL-based icon
 * (via iconUrl), or a standard Metabase Icon (via name). Drop-in replacement
 * for `<Icon {...iconData} />` wherever iconUrl/IconComponent may be present.
 */
export function EntityIcon({
  iconUrl,
  iconDarkUrl,
  IconComponent,
  name = "unknown",
  size = "1rem",
  color,
  style,
  alt = "",
  ...rest
}: EntityIconProps) {
  const theme = useMantineTheme();
  const isDarkMode = theme.other.colorScheme === "dark";

  if (IconComponent) {
    // Wrap in a Box with Mantine's `c` prop so the theme color resolves to a
    // CSS `color` on the parent; the icon bundle's SVG uses `currentColor`,
    // so it inherits the white-labeled color automatically.
    return <IconComponent size={size} />;
  }

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
