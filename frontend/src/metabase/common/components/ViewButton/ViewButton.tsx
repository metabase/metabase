import cx from "classnames";
import type { CSSProperties } from "react";

import CS from "metabase/css/core/index.css";
import { Button, type ButtonProps, Icon } from "metabase/ui";
import type { IconName } from "metabase-types/api";

import S from "./ViewButton.module.css";

interface Props extends Omit<ButtonProps, "color"> {
  color?: string;
  active?: boolean;
  icon?: IconName;
  iconSize?: number;
  labelBreakpoint?: "sm";
  onClick?: () => void;
}

// NOTE: some of this is duplicated from NotebookCell.jsx
export const ViewButton = ({
  className,
  active,
  color,
  icon,
  iconSize,
  labelBreakpoint,
  children,
  ...props
}: Props) => {
  return (
    <Button
      className={cx(S.ViewButton, { [S.active]: active }, className)}
      leftSection={
        icon ? <Icon name={icon} size={iconSize ?? 16} /> : undefined
      }
      style={
        {
          "--view-button-color": color ?? "var(--mb-color-brand)",
        } as CSSProperties
      }
      {...props}
    >
      {children != null && (
        <span
          className={
            labelBreakpoint === "sm" ? cx(CS.hide, CS.smShow) : undefined
          }
        >
          {children}
        </span>
      )}
    </Button>
  );
};
