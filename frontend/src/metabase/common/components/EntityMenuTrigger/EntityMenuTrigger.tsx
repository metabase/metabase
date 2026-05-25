import cx from "classnames";
import type { CSSProperties } from "react";
import { forwardRef } from "react";

import { Button, type ButtonProps } from "metabase/common/components/Button";
import { Tooltip } from "metabase/ui";

import S from "./EntityMenuTrigger.module.css";

export interface EntityMenuIconButtonProps extends ButtonProps {
  className?: string;
  color?: string;
  hover?: {
    color: string;
    backgroundColor: string;
  };
  "data-testid"?: string;
}

export const EntityMenuIconButton = forwardRef<
  HTMLButtonElement,
  EntityMenuIconButtonProps
>(function EntityMenuIconButton(
  { className, color, hover, style, ...props },
  ref,
) {
  const cssVars: Record<string, string> = {};
  if (color) {
    cssVars["--entity-menu-trigger-color"] = color;
  }
  if (hover?.color) {
    cssVars["--entity-menu-trigger-hover-color"] = hover.color;
  }
  if (hover?.backgroundColor) {
    cssVars["--entity-menu-trigger-hover-bg"] = hover.backgroundColor;
  }

  const mergedStyle: CSSProperties = {
    ...style,
    ...(cssVars as CSSProperties),
  };

  return (
    <Button
      {...props}
      ref={ref}
      className={cx(S.iconButton, className)}
      style={mergedStyle}
      iconSize={props.iconSize ?? 16}
      onlyIcon={props.onlyIcon ?? true}
    />
  );
});

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
