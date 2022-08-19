import React from "react";

import Tooltip from "metabase/components/Tooltip";
import {
  EntityMenuIconButton,
  EntityMenuIconButtonProps,
} from "./EntityMenuTrigger.styled";

type EntityMenuTriggerProps = {
  icon: string;
  onClick: () => void;
  open?: boolean;
  tooltip?: string;
  triggerProps?: EntityMenuIconButtonProps;
  trigger: React.ReactElement;
};

const EntityMenuTrigger = ({
  icon,
  onClick,
  open,
  tooltip,
  triggerProps,
  trigger,
}: EntityMenuTriggerProps) => {
  const triggerContent = trigger ? (
    <span onClick={onClick} {...triggerProps}>
      {trigger}
    </span>
  ) : (
    <EntityMenuIconButton onClick={onClick} icon={icon} {...triggerProps} />
  );
  return tooltip ? (
    <Tooltip tooltip={tooltip} isEnabled={!open}>
      {triggerContent}
    </Tooltip>
  ) : (
    triggerContent
  );
};

export default EntityMenuTrigger;
