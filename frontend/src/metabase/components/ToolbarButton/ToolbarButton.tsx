import type { ButtonHTMLAttributes, MouseEvent, Ref } from "react";
import { forwardRef } from "react";

import type { ActionIconProps, IconName } from "metabase/ui";
import { ActionIcon, Box, Icon, Tooltip } from "metabase/ui";

export type ToolbarButtonProps = {
  icon?: IconName;
  "aria-label": string;
  tooltipLabel?: string;
  visibleOnSmallScreen?: boolean;
  isActive?: boolean;
  hasBackground?: boolean;
} & ActionIconProps &
  ButtonHTMLAttributes<HTMLButtonElement>;

export const ToolbarButton = forwardRef(function ToolbarButton(
  {
    icon = "unknown",
    "aria-label": ariaLabel,
    onClick,
    tooltipLabel,
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
      onClick?.(e);
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
      aria-label={ariaLabel}
      onClick={handleButtonClick}
      bg={hasBackground ? undefined : "transparent"}
      disabled={disabled}
      c="var(--mb-color-text-primary)"
      {...actionIconProps}
    >
      {children ?? (
        <Icon
          name={icon}
          color={isActive ? "var(--mb-color-brand)" : undefined}
        />
      )}
    </ActionIcon>
  );

  if (!tooltipLabel) {
    return actionButton;
  }
  return (
    <Tooltip label={tooltipLabel}>
      <Box>{actionButton}</Box>
    </Tooltip>
  );
});
