import { t } from "ttag";

import {
  useIsFullPageMetabot,
  useUserMetabotPermissions,
} from "metabase/metabot/hooks";
import { useSetting } from "metabase/settings";
import { ActionIcon, type ActionIconProps, Tooltip } from "metabase/ui";
import { METAKEY } from "metabase/utils/browser";

import { trackMetabotChatOpened } from "../analytics";

import { useToggleFloatingChat } from "./MetabotFloatingChat";
import { MetabotIcon } from "./MetabotIcon";

interface MetabotAppBarButtonProps extends ActionIconProps {
  className?: string;
}

export function MetabotAppBarButton({
  className,
  ...rest
}: MetabotAppBarButtonProps) {
  const { hasMetabotAccess } = useUserMetabotPermissions();
  const { isFloating, toggleFloatingChat } = useToggleFloatingChat();
  const metabotName = useSetting("metabot-name");
  const isFullPageMetabot = useIsFullPageMetabot();

  if (!hasMetabotAccess) {
    return null;
  }

  // PROTOTYPE: opens a blank conversation in the floating card, not the sidebar
  const handleClick = () => {
    if (!isFloating) {
      trackMetabotChatOpened("header");
    }
    toggleFloatingChat();
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
