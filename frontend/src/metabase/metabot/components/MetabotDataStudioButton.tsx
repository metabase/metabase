import { t } from "ttag";

import {
  useMetabotAgent,
  useMetabotName,
  useUserMetabotPermissions,
} from "metabase/metabot/hooks";
import { getLocation } from "metabase/selectors/routing";
import { ActionIcon, Tooltip } from "metabase/ui";
import { METAKEY } from "metabase/utils/browser";
import { useSelector } from "metabase/utils/redux";
import * as Urls from "metabase/utils/urls";

import { trackMetabotChatOpened } from "../analytics";

import { MetabotIcon } from "./MetabotIcon";

export const MetabotDataStudioButton = () => {
  const { canUseMetabot } = useUserMetabotPermissions();
  const metabot = useMetabotAgent("omnibot");
  const metabotName = useMetabotName();
  const location = useSelector(getLocation);

  if (!canUseMetabot) {
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
