import { t } from "ttag";

import {
  useMetabotAgent,
  useMetabotName,
  useUserMetabotPermissions,
} from "metabase/metabot/hooks";
import { ActionIcon, type ActionIconProps, Tooltip } from "metabase/ui";
import { METAKEY } from "metabase/utils/browser";

import { trackMetabotChatOpened } from "../analytics";

import { MetabotIcon } from "./MetabotIcon";

interface MetabotAppBarButtonProps extends ActionIconProps {
  className?: string;
}

export function MetabotAppBarButton({
  className,
  ...rest
}: MetabotAppBarButtonProps) {
  const { hasMetabotAccess } = useUserMetabotPermissions();
  const metabot = useMetabotAgent("omnibot");
  const metabotName = useMetabotName();

  if (!hasMetabotAccess) {
    return null;
  }

  const handleClick = () => {
    if (!metabot.visible) {
      trackMetabotChatOpened("header");
    }

    metabot.setVisible(!metabot.visible);
  };

  const label = t`Chat with ${metabotName} (${METAKEY}+E)`;

  return (
    <Tooltip label={label}>
      <ActionIcon
        className={className}
        variant="subtle"
        c="text-primary"
        bd="1px solid var(--mb-color-border)"
        p="sm"
        h="2.25rem"
        w="2.25rem"
        aria-label={label}
        onClick={handleClick}
        {...rest}
      >
        <MetabotIcon />
      </ActionIcon>
    </Tooltip>
  );
}
