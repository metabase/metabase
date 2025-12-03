import { Link } from "react-router";
import { t } from "ttag";

import { ActionIcon, Icon, Tooltip } from "metabase/ui";
import * as Urls from "metabase-enterprise/urls";

export const EditUserStrategySettingsButton = () => (
  <Link to={Urls.editUserStrategy()}>
    <Tooltip label={t`Edit user strategy`}>
      <ActionIcon
        size="lg"
        variant="outline"
        c="text-primary"
        bd="1px solid var(--mb-color-border)"
      >
        <Icon name="gear" />
      </ActionIcon>
    </Tooltip>
  </Link>
);
