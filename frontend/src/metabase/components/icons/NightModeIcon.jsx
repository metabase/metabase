/* @flow */

import React from "react";

import Icon from "metabase/components/Icon.jsx";

type Props = {
  // ...IconProps,
  isNightMode: boolean,
};

const NightModeIcon = ({ isNightMode, ...props }: Props) => (
  <Icon name={isNightMode ? "sun" : "moon"} {...props} />
);

export default NightModeIcon;
