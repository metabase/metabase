import { t } from "ttag";

import { ForwardRefLink, Link } from "metabase/common/components/Link";
import { ActionIcon, Icon, Menu, Tooltip } from "metabase/ui";
import * as Urls from "metabase-enterprise/urls";

export const EditUserStrategySettingsButton = ({
  page,
}: {
  page: "people" | "tenants";
}) => (
  <Link to={Urls.editUserStrategy(page)}>
    <Tooltip label={t`Edit user strategy`}>
      <ActionIcon size="lg">
        <Icon name="gear" />
      </ActionIcon>
    </Tooltip>
  </Link>
);

/** The "Pick a user strategy" item of a settings menu, opening the user strategy modal for `page`. */
export const UserStrategyMenuItem = ({
  page,
}: {
  page: "people" | "tenants";
}) => (
  <Menu.Item component={ForwardRefLink} to={Urls.editUserStrategy(page)}>
    {t`Pick a user strategy`}
  </Menu.Item>
);
