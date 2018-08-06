import React from "react";

import Icon, { IconWrapper } from "metabase/components/Icon";
import Tooltip from "metabase/components/Tooltip";

const EntityMenuTrigger = ({ icon, onClick, open, tooltip }) => {
  const trigger = (
    <IconWrapper onClick={onClick}>
      <Icon name={icon} m={1} />
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
