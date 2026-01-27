import cx from "classnames";
import type { CSSProperties } from "react";

import { Button } from "metabase/common/components/Button";
import type { ColorName } from "metabase/lib/colors/types";
import type { IconName } from "metabase/ui";
import { Tooltip } from "metabase/ui";

import S from "./NotebookActionButton.module.css";

interface NotebookActionButtonProps {
  className?: string;
  icon?: IconName;
  title: string;
  color: ColorName;
  secondary?: boolean;
  large?: boolean;
  onClick: () => void;
}

export function NotebookActionButton({
  className,
  icon,
  title,
  color,
  secondary,
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
          [S.secondary]: secondary,
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
          "--notebook-action-button-color": `var(--mb-color-${color})`,
        } as CSSProperties
      }
      {...props}
    >
      {label}
    </Button>
  );

  return large ? button : <Tooltip label={title}>{button}</Tooltip>;
}
