import cx from "classnames";
import type { CSSProperties } from "react";

import { Flex, Icon, Tooltip, UnstyledButton } from "metabase/ui";
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
    <UnstyledButton
      className={cx(
        S.ColorButton,
        {
          [S.secondary]: secondary,
          [S.large]: large,
          [S.small]: !large,
        },
        className,
      )}
      aria-label={label}
      onClick={onClick}
      style={
        {
          "--notebook-action-button-color": `var(--mb-color-${color})`,
        } as CSSProperties
      }
      {...props}
    >
      {large ? (
        <Flex direction="column" align="center" miw="60px">
          {icon && <Icon name={icon} size={20} />}
          {label && <span className={S.label}>{label}</span>}
        </Flex>
      ) : (
        icon && <Icon name={icon} size={16} />
      )}
    </UnstyledButton>
  );

  return large ? button : <Tooltip label={title}>{button}</Tooltip>;
}
