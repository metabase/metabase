import { Text } from "metabase/ui";
import { IconName } from "metabase/core/components/Icon";
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
