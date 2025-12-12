import cx from "classnames";
import { type HTMLProps, type Ref, forwardRef } from "react";
import { t } from "ttag";

import bug from "assets/img/metabot-bug-report.svg?component";
import cloud from "assets/img/metabot-cloud-96x96.svg?component";
import happy from "assets/img/metabot-happy.svg?component";
import sad from "assets/img/metabot-sad.svg?component";
import cool from "assets/img/metabot-shades.svg?component";

import Styles from "./MetabotLogo.module.css";

const urlByVariant = {
  happy,
  sad,
  cool,
  bug,
  cloud,
};

export type MetabotVariant = keyof typeof urlByVariant;

export interface MetabotLogoProps extends HTMLProps<SVGSVGElement> {
  className?: string;
  variant?: MetabotVariant;
  isCool?: boolean;
}

export const MetabotLogo = forwardRef(function MetabotLogo(
  { variant = "happy", className, isCool, ...rest }: MetabotLogoProps,
  ref: Ref<any>,
) {
  const MetabotComponent = urlByVariant[variant];

  return (
    <MetabotComponent
      className={cx(Styles.MetabotLogo, className)}
      {...rest}
      ref={ref}
      aria-label={t`Metabot`}
      role="img"
    />
  );
});
