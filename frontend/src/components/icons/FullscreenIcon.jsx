import React from "react";

import Icon from "metabase/components/Icon.jsx";

const FullscreenIcon = (props) =>
    <Icon name={props.isFullscreen ? "contract" : "expand"} {...props} />

export default FullscreenIcon;
