import Tooltip from "metabase/core/components/Tooltip";
import type { IconName } from "metabase/ui";

import { ColorButton } from "./NotebookStep.styled";

interface ActionButtonProps {
  className?: string;

  icon?: IconName;
  title: string;
  color: string;
  transparent?: boolean;
  large?: boolean;
  onClick: () => void;
}

function ActionButton({
  icon,
  title,
  color,
  transparent,
  large,
  onClick,
  ...props
}: ActionButtonProps) {
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ActionButton;
