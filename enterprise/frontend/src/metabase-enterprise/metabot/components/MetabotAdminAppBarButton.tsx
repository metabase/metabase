import { useLocation } from "react-use";
import { t } from "ttag";

import { METAKEY } from "metabase/lib/browser";
import * as Urls from "metabase/lib/urls";
import { AdminActionButton } from "metabase/nav/components/AdminNavbar/AdminNavbar.styled";
import { Icon, Tooltip } from "metabase/ui";

import { trackMetabotChatOpened } from "../analytics";
import { useMetabotAgent } from "../hooks";

export const MetabotAdminAppBarButton = () => {
  const metabot = useMetabotAgent();

  const location = useLocation();
  const disabled = !location.pathname?.startsWith(Urls.transformList());

  const handleClick = () => {
    if (!metabot.visible) {
      trackMetabotChatOpened("header");
    }

    metabot.setVisible(!metabot.visible);
  };

  return (
    <Tooltip
      label={
        disabled
          ? `Metabot can't be viewed on this page`
          : t`Chat with Metabot (${METAKEY}+E)`
      }
    >
      <AdminActionButton disabled={disabled} onClick={handleClick}>
        <Icon name="metabot" />
      </AdminActionButton>
    </Tooltip>
  );
};
