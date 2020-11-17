import React from "react";

import Icon from "metabase/components/Icon";

const FullscreenIcon = ({ isFullscreen, ...props }) => (
  <Icon name={isFullscreen ? "contract" : "expand"} {...props} />
);

export default FullscreenIcon;
