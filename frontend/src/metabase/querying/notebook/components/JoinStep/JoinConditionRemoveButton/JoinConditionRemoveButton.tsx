import cx from "classnames";
import { t } from "ttag";

import { Icon } from "metabase/ui";

import S from "./JoinConditionRemoveButton.module.css";

interface JoinConditionRemoveButtonProps {
  isConditionComplete: boolean;
  onClick?: () => void;
}

export function JoinConditionRemoveButton({
  isConditionComplete,
  onClick,
}: JoinConditionRemoveButtonProps) {
  return (
    <button
      className={cx(S.RemoveButton, {
        [S.isConditionComplete]: isConditionComplete,
      })}
      aria-label={t`Remove condition`}
      onClick={onClick}
    >
      {<Icon name="close" size={16} />}
    </button>
  );
}
