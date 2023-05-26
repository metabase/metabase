import React from "react";
import { ToolbarButtonIcon, ToolbarButtonRoot } from "./ToolbarButton.styled";

interface ToolbarButtonProps {
  text: string;
  icon: string;
  onClick?: () => void;
}

export const ToolbarButton = ({ onClick, text, icon }: ToolbarButtonProps) => {
  return (
    <ToolbarButtonRoot onClick={onClick}>
      <ToolbarButtonIcon name={icon} />
      {text}
    </ToolbarButtonRoot>
  );
};
