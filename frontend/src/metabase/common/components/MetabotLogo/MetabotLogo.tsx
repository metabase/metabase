import cx from "classnames";
import { type Ref, forwardRef } from "react";
import { t } from "ttag";

import happy from "assets/img/metabot-happy.svg?component";
import sad from "assets/img/metabot-sad.svg?component";
import cool from "assets/img/metabot-shades.svg?component";

export type MetabotVariant = "happy" | "sad" | "cool";
import Styles from "./MetabotLogo.module.css";

const urlByVariant = {
  happy,
  sad,
  cool,
};

export interface MetabotLogoProps {
  className?: string;
  variant?: MetabotVariant;
}

const MetabotLogo = forwardRef(function MetabotLogo(
  { variant = "happy", className, ...rest }: MetabotLogoProps,
  ref: Ref<any>,
) {
  const MetabotComponent = urlByVariant[variant];
  return (
    <MetabotComponent
      className={cx(Styles.MetabotLogo, className)}
      {...rest}
      ref={ref}
      aria-label={t`Metabot`}
    />
  );
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default MetabotLogo;
