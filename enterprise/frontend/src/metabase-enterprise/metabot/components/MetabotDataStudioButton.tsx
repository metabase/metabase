import { t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import { METAKEY } from "metabase/lib/browser";
import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { getLocation } from "metabase/selectors/routing";
import { ActionIcon, Icon, Tooltip } from "metabase/ui";

import { trackMetabotChatOpened } from "../analytics";
import { METABOT_USE_CASES } from "../constants";
import { useMetabotAgent } from "../hooks";

export const MetabotDataStudioButton = () => {
  const metabot = useMetabotAgent();
  const location = useSelector(getLocation);
  const enabledUseCases = useSetting("metabot-enabled-use-cases");
  const isTransformsEnabled =
    enabledUseCases?.includes(METABOT_USE_CASES.TRANSFORMS) ?? false;
  const isOnTransformsPage = location.pathname?.startsWith(
    Urls.transformList(),
  );
  const disabled = !isOnTransformsPage || !isTransformsEnabled;

  const handleClick = () => {
    if (!metabot.visible) {
      trackMetabotChatOpened("header");
    }

    metabot.setVisible(!metabot.visible);
  };

  const label = !isTransformsEnabled
    ? t`Metabot has not been enabled for transforms`
    : !isOnTransformsPage
      ? t`Metabot can't be viewed on this page`
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
