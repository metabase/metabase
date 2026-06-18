import cx from "classnames";
import type { CSSProperties, ComponentPropsWithoutRef } from "react";

import CS from "metabase/css/core/index.css";
import { Icon, UnstyledButton } from "metabase/ui";
import type { IconName } from "metabase-types/api";

import S from "./ViewButton.module.css";

interface Props extends ComponentPropsWithoutRef<"button"> {
  color?: string;
  active?: boolean;
  medium?: boolean;
  onlyIcon?: boolean;
  icon?: IconName;
  iconSize?: number;
  labelBreakpoint?: "sm";
}

// NOTE: some of this is duplicated from NotebookCell.jsx
export const ViewButton = ({
  className,
  active,
  color,
  medium,
  onlyIcon,
  icon,
  iconSize = 16,
  labelBreakpoint,
  children,
  ...props
}: Props) => {
  return (
    <UnstyledButton
      className={cx(
        S.ViewButton,
        {
          [S.active]: active,
          [S.medium]: medium,
          [S.onlyIcon]: onlyIcon,
        },
        className,
      )}
      style={
        {
          "--view-button-color": color ?? "var(--mb-color-core-brand)",
        } as CSSProperties
      }
      {...props}
    >
      {icon && <Icon name={icon} size={iconSize} />}
      {children && (
        <span
          className={cx(
            S.label,
            labelBreakpoint === "sm" && [CS.hide, CS.smShow],
          )}
        >
          {children}
        </span>
      )}
    </UnstyledButton>
  );
};
