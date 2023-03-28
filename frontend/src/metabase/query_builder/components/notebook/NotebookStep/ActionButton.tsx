import React from "react";
import Tooltip from "metabase/core/components/Tooltip";
import { ColorButton } from "./NotebookStep.styled";

interface ActionButtonProps {
  className?: string;

  icon?: string;
  title: string;
  color: string;
  transparent?: boolean;
  large?: boolean;
  onClick: () => void;

  // styled-system props
  mt?: number | number[];
  mr?: number | number[];
  ml?: number | number[];
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
      iconSize={large ? 18 : 14}
      aria-label={label}
      onClick={onClick}
      {...props}
    >
      {label}
    </ColorButton>
  );

  return large ? button : <Tooltip tooltip={title}>{button}</Tooltip>;
}

export default ActionButton;
