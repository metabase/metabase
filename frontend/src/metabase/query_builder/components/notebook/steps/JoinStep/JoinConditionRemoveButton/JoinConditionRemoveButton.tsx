import { Icon } from "metabase/ui";

import { RemoveButton } from "./JoinConditionRemoveButton.styled";

interface JoinConditionRemoveButtonProps {
  isComplete: boolean;
  onClick?: () => void;
}

export function JoinConditionRemoveButton({
  isComplete,
  onClick,
}: JoinConditionRemoveButtonProps) {
  return (
    <RemoveButton isComplete={isComplete} onClick={onClick}>
      {<Icon name="close" size={16} />}
    </RemoveButton>
  );
}
