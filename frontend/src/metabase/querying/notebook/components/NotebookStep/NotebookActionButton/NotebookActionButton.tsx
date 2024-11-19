import Tooltip from "metabase/core/components/Tooltip";
import type { IconName } from "metabase/ui";

import { ColorButton } from "../NotebookStep.styled";

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
    <ColorButton
      icon={icon}
      small={!large}
      color={color}
      transparent={transparent}
      iconVertical={large}
      iconSize={large ? 20 : 16}
      aria-label={label}
      onClick={onClick}
      {...props}
    >
      {label}
    </ColorButton>
  );

  return large ? button : <Tooltip tooltip={title}>{button}</Tooltip>;
}
