import { t } from "ttag";

import { Icon } from "metabase/ui";

import { RemoveButton } from "./JoinConditionRemoveButton.styled";

interface JoinConditionRemoveButtonProps {
  isConditionComplete: boolean;
  onClick?: () => void;
}

export function JoinConditionRemoveButton({
  isConditionComplete,
  onClick,
}: JoinConditionRemoveButtonProps) {
  return (
    <RemoveButton
      isConditionComplete={isConditionComplete}
      aria-label={t`Remove condition`}
      onClick={onClick}
    >
      {<Icon name="close" size={16} />}
    </RemoveButton>
  );
}
