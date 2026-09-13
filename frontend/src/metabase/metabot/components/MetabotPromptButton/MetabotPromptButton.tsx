import cx from "classnames";
import { t } from "ttag";

import { IconButtonWrapper } from "metabase/common/components/IconButtonWrapper";
import { useUserMetabotPermissions } from "metabase/metabot/hooks";
import type { SqlGenerationPromptButtonProps } from "metabase/querying/plugins";
import { useSetting } from "metabase/settings";
import { Icon, Tooltip } from "metabase/ui";

import S from "./MetabotPromptButton.module.css";

export const MetabotPromptButton = ({
  size,
  isPromptInputOpen,
  onClick,
}: SqlGenerationPromptButtonProps) => {
  const { hasSqlGenerationAccess } = useUserMetabotPermissions();
  const metabotName = useSetting("metabot-name");

  if (!hasSqlGenerationAccess) {
    return null;
  }

  const label = t`Ask ${metabotName}`;

  return (
    <Tooltip label={label}>
      <IconButtonWrapper
        aria-label={label}
        aria-pressed={isPromptInputOpen}
        className={cx(S.button, {
          [S.isSelected]: isPromptInputOpen,
        })}
        onClick={onClick}
      >
        <Icon name="metabot" size={size} />
      </IconButtonWrapper>
    </Tooltip>
  );
};
