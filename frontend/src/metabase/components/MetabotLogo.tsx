import React, { forwardRef, Ref } from "react";
import cx from "classnames";
import { t } from "ttag";

export interface MetabotLogoProps {
  className?: string;
}

const MetabotLogo = forwardRef(function MetabotLogo(
  props: MetabotLogoProps,
  ref: Ref<HTMLImageElement>,
) {
  return (
    <img
      className={cx("brand-hue", props.className)}
      ref={ref}
      alt={t`Metabot`}
      src="app/assets/img/metabot.svg"
    />
  );
});

export default MetabotLogo;
