import type { IconName } from "metabase/ui";
import { Text } from "metabase/ui";

import { ToolbarButtonIcon, ToolbarButtonRoot } from "./ToolbarButton.styled";

interface ToolbarButtonProps {
  text: string;
  icon: IconName;
  onClick?: () => void;
}

export const ToolbarButton = ({ onClick, text, icon }: ToolbarButtonProps) => {
  return (
    <ToolbarButtonRoot onClick={onClick}>
      <ToolbarButtonIcon name={icon} />
      <Text>{text}</Text>
    </ToolbarButtonRoot>
  );
};
