import React, { forwardRef, Ref } from "react";
import { t } from "ttag";
import { LogoRoot } from "./MetabotLogo.styled";

export interface MetabotLogoProps {
  className?: string;
}

const MetabotLogo = forwardRef(function MetabotLogo(
  props: MetabotLogoProps,
  ref: Ref<HTMLImageElement>,
) {
  return (
    <LogoRoot
      {...props}
      ref={ref}
      alt={t`Metabot`}
      src="app/assets/img/metabot.svg"
    />
  );
});

export default MetabotLogo;
