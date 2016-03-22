import React from "react";

import Icon from "metabase/components/Icon.jsx";

const NightModeIcon = (props) =>
    <Icon name={props.isNightMode ? "sun" : "moon"} {...props} />

export default NightModeIcon;
