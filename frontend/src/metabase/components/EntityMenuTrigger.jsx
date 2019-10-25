import React from "react";

import Icon, { IconWrapper } from "metabase/components/Icon";
import Tooltip from "metabase/components/Tooltip";

const EntityMenuTrigger = ({ icon, onClick, open, tooltip, triggerProps }) => {
  const trigger = (
    <IconWrapper onClick={onClick} {...triggerProps}>
      <Icon size={18} name={icon} m={1} />
    </IconWrapper>
  );
  return tooltip ? (
    <Tooltip tooltip={tooltip} isEnabled={!open}>
      {trigger}
    </Tooltip>
  ) : (
    trigger
  );
};

export default EntityMenuTrigger;
