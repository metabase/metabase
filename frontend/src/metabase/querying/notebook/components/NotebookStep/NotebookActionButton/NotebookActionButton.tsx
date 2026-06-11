import cx from "classnames";
import type { CSSProperties } from "react";

import { Button, Icon, Tooltip } from "metabase/ui";
import type { ColorName } from "metabase/ui/colors/types";
import type { IconName } from "metabase-types/api";

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
      variant="subtle"
      className={cx(
        S.ColorButton,
        {
          [S.secondary]: secondary,
        },
        className,
      )}
      classNames={{ inner: large ? S.verticalInner : undefined }}
      leftSection={
        icon ? <Icon name={icon} size={large ? 20 : 16} /> : undefined
      }
      h={large ? "auto" : "2rem"}
      p={large ? "0.5rem 0.75rem" : "0.5rem"}
      miw={large ? "60px" : undefined}
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
