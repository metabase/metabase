import type * as React from "react";

import { Tooltip } from "metabase/ui";

import type { EntityMenuIconButtonProps } from "./EntityMenuTrigger.styled";
import { EntityMenuIconButton } from "./EntityMenuTrigger.styled";

type EntityMenuTriggerProps = {
  icon: string;
  onClick: () => void;
  open?: boolean;
  tooltip?: string;
  tooltipPlacement?: "top" | "bottom";
  triggerProps?: EntityMenuIconButtonProps;
  trigger?: React.ReactElement;
  ariaLabel?: string;
};

export const EntityMenuTrigger = ({
  icon,
  onClick,
  open,
  tooltip,
  tooltipPlacement,
  triggerProps,
  trigger,
  ariaLabel,
}: EntityMenuTriggerProps) => {
  const triggerContent = trigger ? (
    <span onClick={onClick} {...triggerProps}>
      {trigger}
    </span>
  ) : (
    <EntityMenuIconButton
      aria-label={ariaLabel}
      onClick={onClick}
      icon={icon}
      {...triggerProps}
    />
  );
  return tooltip ? (
    <Tooltip label={tooltip} disabled={open} position={tooltipPlacement}>
      {triggerContent}
    </Tooltip>
  ) : (
    triggerContent
  );
};
