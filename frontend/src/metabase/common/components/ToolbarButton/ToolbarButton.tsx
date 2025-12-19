import type { ButtonHTMLAttributes, MouseEvent, Ref } from "react";
import { forwardRef } from "react";

import type { ActionIconProps, IconName, TooltipProps } from "metabase/ui";
import { ActionIcon, Box, Icon, Tooltip } from "metabase/ui";

export type ToolbarButtonProps = {
  icon?: IconName;
  tooltipPosition?: TooltipProps["position"];
  visibleOnSmallScreen?: boolean;
  isActive?: boolean;
  hasBackground?: boolean;
} & ActionIconProps &
  (
    | {
        "aria-label": string;
        tooltipLabel?: TooltipProps["label"];
      }
    | {
        // Allow `aria-label` to be optional if `tooltipLabel` is provided as a string, so we don't need to provide the same string twice.
        "aria-label"?: string;
        tooltipLabel: string;
      }
  ) &
  ButtonHTMLAttributes<HTMLButtonElement>;

export const ToolbarButton = forwardRef(function ToolbarButton(
  {
    icon = "unknown",
    "aria-label": ariaLabel,
    onClick,
    tooltipLabel,
    tooltipPosition,
    visibleOnSmallScreen = true,
    isActive = false,
    hasBackground = true,
    children,
    disabled,
    ...actionIconProps
  }: ToolbarButtonProps,
  ref: Ref<HTMLButtonElement>,
) {
  const handleButtonClick = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (onClick && !disabled) {
      onClick(e);
    }
  };

  const actionButton = (
    <ActionIcon
      data-testid="toolbar-button"
      data-is-active={isActive}
      ref={ref}
      display={{
        base: visibleOnSmallScreen ? "flex" : "none",
        sm: "flex",
      }}
      size="2rem"
      variant="viewHeader"
      aria-label={
        ariaLabel ??
        (typeof tooltipLabel === "string" ? tooltipLabel : undefined)
      }
      onClick={handleButtonClick}
      bg={hasBackground ? undefined : "transparent"}
      disabled={disabled}
      {...actionIconProps}
    >
      {children ?? <Icon name={icon} c={isActive ? "brand" : undefined} />}
    </ActionIcon>
  );

  if (!tooltipLabel) {
    return actionButton;
  }
  return (
    <Tooltip label={tooltipLabel} position={tooltipPosition}>
      <Box>{actionButton}</Box>
    </Tooltip>
  );
});
