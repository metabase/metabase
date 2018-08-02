import React from "react";

import Icon, { IconWrapper } from "metabase/components/Icon";
import Tooltip from "metabase/components/Tooltip";

const EntityMenuTrigger = ({ icon, onClick, open, tooltip }) => {
  return (
    <Tooltip tooltip={tooltip} isEnabled={!open}>
      <IconWrapper onClick={onClick}>
        <Icon name={icon} m={1} />
      </IconWrapper>
    </Tooltip>
  );
};

export default EntityMenuTrigger;
