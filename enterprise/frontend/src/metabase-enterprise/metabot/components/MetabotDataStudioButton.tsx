import { t } from "ttag";

import { METAKEY } from "metabase/lib/browser";
import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { getLocation } from "metabase/selectors/routing";
import { ActionIcon, type ActionIconProps, Icon, Tooltip } from "metabase/ui";

import { trackMetabotChatOpened } from "../analytics";
import { useMetabotAgent } from "../hooks";

export const MetabotDataStudioButton = (props: ActionIconProps) => {
  const metabot = useMetabotAgent();
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
        p="sm"
        h="2.25rem"
        w="2.25rem"
        disabled={disabled}
        aria-label={label}
        onClick={handleClick}
        {...props}
      >
        <Icon c={disabled ? undefined : "text-primary"} name="metabot" />
      </ActionIcon>
    </Tooltip>
  );
};
