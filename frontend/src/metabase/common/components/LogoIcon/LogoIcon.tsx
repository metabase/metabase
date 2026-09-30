import cx from "classnames";

import { BRAND } from "metabase/branding/config";
import CS from "metabase/css/core/index.css";
import { PLUGIN_LOGO_ICON_COMPONENTS } from "metabase/plugins";

interface LogoIconProps {
  width?: number;
  height?: number;
  dark?: boolean;
  fill?: string;
}

/**
 * ALL Tecnologias: logo padrão substituído pela imagem definida em
 * metabase/branding/config.ts (assets/img/all-logo.svg).
 */
export const DefaultLogoIcon = ({
  dark,
  height = 32,
  width,
}: LogoIconProps) => {
  return (
    <img
      className={cx("Icon", { [CS.textWhite]: dark })}
      src={BRAND.logoUrl}
      alt={BRAND.name}
      width={width}
      height={height}
      style={{ objectFit: "contain" }}
      data-testid="main-logo"
    />
  );
};

export function LogoIcon(props: LogoIconProps) {
  const [Component = DefaultLogoIcon] = PLUGIN_LOGO_ICON_COMPONENTS;
  return <Component {...props} />;
}
