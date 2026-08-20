import cx from "classnames";
import { t } from "ttag";

import { useUserMetabotPermissions } from "metabase/metabot/hooks";
import { useSetting } from "metabase/settings";
import { Box, Icon, Tooltip } from "metabase/ui";

import S from "./MetabotPromptButton.module.css";

interface MetabotPromptButtonProps {
  size: number;
  isPromptInputOpen?: boolean;
  onClick?: () => void;
}

export const MetabotPromptButton = ({
  size,
  isPromptInputOpen,
  onClick,
}: MetabotPromptButtonProps) => {
  const { hasSqlGenerationAccess } = useUserMetabotPermissions();
  const metabotName = useSetting("metabot-name");

  if (!hasSqlGenerationAccess) {
    return null;
  }

  const label = t`Ask ${metabotName}`;

  return (
    <Tooltip label={label}>
      <Box
        aria-label={label}
        aria-pressed={isPromptInputOpen}
        component="a"
        h={size}
        className={cx(S.ButtonRoot, {
          [S.isSelected]: isPromptInputOpen,
        })}
        onClick={onClick}
      >
        <Icon name="metabot" size={size} />
      </Box>
    </Tooltip>
  );
};
