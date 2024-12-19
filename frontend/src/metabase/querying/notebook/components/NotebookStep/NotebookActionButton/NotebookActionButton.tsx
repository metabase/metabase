import cx from "classnames";
import type { CSSProperties } from "react";

import Button from "metabase/core/components/Button";
import Tooltip from "metabase/core/components/Tooltip";
import type { IconName } from "metabase/ui";

import S from "./NotebookActionButton.module.css";

interface NotebookActionButtonProps {
  className?: string;

  icon?: IconName;
  title: string;
  color: string;
  transparent?: boolean;
  large?: boolean;
  onClick: () => void;
}

export function NotebookActionButton({
  className,
  icon,
  title,
  color,
  transparent,
  large,
  onClick,
  ...props
}: NotebookActionButtonProps) {
  const label = large ? title : undefined;

  const button = (
    <Button
      className={cx(
        S.ColorButton,
        {
          [S.transparent]: transparent,
        },
        className,
      )}
      icon={icon}
      small={!large}
      iconVertical={large}
      iconSize={large ? 20 : 16}
      aria-label={label}
      onClick={onClick}
      style={
        {
          "--notebook-action-button-color": color,
        } as CSSProperties
      }
      {...props}
    >
      {label}
    </Button>
  );

  return large ? button : <Tooltip tooltip={title}>{button}</Tooltip>;
}
