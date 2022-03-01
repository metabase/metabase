import React, { forwardRef } from "react";

const MetabotLogo = forwardRef(function MetabotLogo(props, ref) {
  return (
    <img ref={ref} className="brand-hue" src="app/assets/img/metabot.svg" />
  );
});

export default MetabotLogo;
