import { t } from "ttag";

import { trackMetabotChatOpened } from "metabase/metabot/analytics";
import {
  useIsFullPageMetabot,
  useMetabotAgent,
  useUserMetabotPermissions,
} from "metabase/metabot/hooks";
import { useSetting } from "metabase/settings";
import { ActionIcon, Box, Tooltip } from "metabase/ui";
import { METAKEY } from "metabase/utils/browser";

import { MetabotIcon } from "../MetabotIcon";

import S from "./MetabotFloatingButton.module.css";

/**
 * Circular button floating over the bottom-right corner of the main content
 * that opens the Metabot chat. Hidden while the chat is open.
 */
export function MetabotFloatingButton() {
  const { hasMetabotAccess } = useUserMetabotPermissions();
  const metabot = useMetabotAgent("omnibot");
  const metabotName = useSetting("metabot-name");
  const isFullPageMetabot = useIsFullPageMetabot();

  if (!hasMetabotAccess || isFullPageMetabot || metabot.visible) {
    return null;
  }

  const handleClick = () => {
    trackMetabotChatOpened("header");
    metabot.setVisible(true);
  };

  const label = t`Chat with ${metabotName} (${METAKEY}+E)`;

  return (
    <Box className={S.root}>
      <Tooltip label={label} position="left">
        <ActionIcon
          size="lg"
          radius="50%"
          aria-label={label}
          onClick={handleClick}
          data-testid="metabot-floating-button"
        >
          <MetabotIcon size={24} />
        </ActionIcon>
      </Tooltip>
    </Box>
  );
}
