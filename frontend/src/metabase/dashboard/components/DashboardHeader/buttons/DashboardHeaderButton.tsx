import type { ButtonHTMLAttributes, Ref } from "react";
import { forwardRef } from "react";

import { color } from "metabase/lib/colors";
import type { ActionIconProps, IconName } from "metabase/ui";
import { ActionIcon, Icon, Tooltip } from "metabase/ui";

type DashboardHeaderButtonProps = {
  icon?: IconName;
  "aria-label": string;
  tooltipLabel?: string;
  visibleOnSmallScreen?: boolean;
  isActive?: boolean;
  hasBackground?: boolean;
} & ActionIconProps &
  ButtonHTMLAttributes<HTMLButtonElement>;

export const DashboardHeaderButton = forwardRef(function _DashboardHeaderButton(
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
  }: DashboardHeaderButtonProps,
  ref: Ref<HTMLButtonElement>,
) {
  const actionButton = (
    <ActionIcon
      ref={ref}
      display={{
        base: visibleOnSmallScreen ? "flex" : "none",
        sm: "flex",
      }}
      size="2rem"
      variant="viewHeader"
      aria-label={ariaLabel}
      onClick={onClick}
      bg={hasBackground ? undefined : "transparent"}
      disabled={disabled}
      {...actionIconProps}
    >
      {children ?? (
        <Icon name={icon} color={isActive ? color("brand") : undefined} />
      )}
    </ActionIcon>
  );

  if (!tooltipLabel) {
    return actionButton;
  }
  return <Tooltip label={tooltipLabel}>{actionButton}</Tooltip>;
});
