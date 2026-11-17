import { t } from "ttag";

import {
  useIsFullPageMetabot,
  useMetabotAgent,
  useUserMetabotPermissions,
} from "metabase/metabot/hooks";
import { useSetting } from "metabase/settings";
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
  const metabotName = useSetting("metabot-name");
  const isFullPageMetabot = useIsFullPageMetabot();

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
        aria-label={label}
        onClick={handleClick}
        {...rest}
        disabled={isFullPageMetabot}
      >
        <MetabotIcon />
      </ActionIcon>
    </Tooltip>
  );
}
