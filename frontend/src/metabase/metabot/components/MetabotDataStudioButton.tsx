import { t } from "ttag";

import {
  useMetabotAgent,
  useMetabotName,
  useUserMetabotPermissions,
} from "metabase/metabot/hooks";
import { useLocation } from "metabase/router";
import { ActionIcon, Tooltip } from "metabase/ui";
import * as Urls from "metabase/urls";
import { METAKEY } from "metabase/utils/browser";

import { trackMetabotChatOpened } from "../analytics";

import { MetabotIcon } from "./MetabotIcon";

export const MetabotDataStudioButton = () => {
  const { hasMetabotAccess } = useUserMetabotPermissions();
  const metabot = useMetabotAgent("omnibot");
  const metabotName = useMetabotName();
  const location = useLocation();

  if (!hasMetabotAccess) {
    return null;
  }

  const disabled = !location.pathname?.startsWith(Urls.transformList());

  const handleClick = () => {
    if (!metabot.visible) {
      trackMetabotChatOpened("header");
    }

    metabot.setVisible(!metabot.visible);
  };

  const label = disabled
    ? t`${metabotName} can't be viewed on this page`
    : t`Chat with ${metabotName} (${METAKEY}+E)`;

  return (
    <Tooltip label={label}>
      <ActionIcon
        h="2rem"
        w="2rem"
        disabled={disabled}
        aria-label={label}
        onClick={handleClick}
      >
        <MetabotIcon c={disabled ? undefined : "text-primary"} size={16} />
      </ActionIcon>
    </Tooltip>
  );
};
