import { t } from "ttag";

import { useUserMetabotPermissions } from "metabase/metabot/hooks";
import { useSetting } from "metabase/settings";
import { ActionIcon, Icon, Tooltip } from "metabase/ui";

interface MetabotPromptButtonProps {
  isPromptInputOpen?: boolean;
  onClick?: () => void;
}

export const MetabotPromptButton = ({
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
      <ActionIcon
        variant="subtle"
        aria-label={label}
        aria-pressed={isPromptInputOpen}
        selected={isPromptInputOpen}
        onClick={onClick}
      >
        <Icon name="metabot" />
      </ActionIcon>
    </Tooltip>
  );
};
