/* eslint-disable react/prop-types */
import React from "react";

import { Icon } from "metabase/core/components/Icon";

const FullscreenIcon = ({ isFullscreen, ...props }) => (
  <Icon name={isFullscreen ? "contract" : "expand"} {...props} />
);

export default FullscreenIcon;
