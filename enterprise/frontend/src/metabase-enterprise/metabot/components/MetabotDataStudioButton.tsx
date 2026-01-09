import { t } from "ttag";

import { METAKEY } from "metabase/lib/browser";
import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { getLocation } from "metabase/selectors/routing";
import { ActionIcon, Icon, Tooltip } from "metabase/ui";

import { trackMetabotChatOpened } from "../analytics";
import { useMetabotAgent } from "../hooks";

export const MetabotDataStudioButton = () => {
  const metabot = useMetabotAgent("omnibot");
  const location = useSelector(getLocation);
  const disabled = !location.pathname?.startsWith(Urls.transformList());

  const handleClick = () => {
    if (!metabot.visible) {
      trackMetabotChatOpened("header");
    }

    metabot.setVisible(!metabot.visible);
  };

  const label = disabled
    ? `Metabot can't be viewed on this page`
    : t`Chat with Metabot (${METAKEY}+E)`;

  return (
    <Tooltip label={label}>
      <ActionIcon
        h="2rem"
        w="2rem"
        disabled={disabled}
        aria-label={label}
        onClick={handleClick}
      >
        <Icon
          c={disabled ? undefined : "text-primary"}
          name="metabot"
          size={16}
        />
      </ActionIcon>
    </Tooltip>
  );
};
