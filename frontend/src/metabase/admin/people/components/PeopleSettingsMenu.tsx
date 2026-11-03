import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import { PLUGIN_TENANTS } from "metabase/plugins";
import { useSetting } from "metabase/settings";
import { ActionIcon, Icon, Menu, Tooltip } from "metabase/ui";
import * as Urls from "metabase/urls";

/**
 * The gear menu in the People page header: admin actions that apply to everyone rather than one person. Forcing a
 * password reset for everyone needs email, so people can get a link to set a new password. When the user strategy is
 * all there is to offer, the gear goes straight to it rather than opening a menu of one; with nothing, there is no gear.
 */
export const PeopleSettingsMenu = () => {
  const isEmailConfigured = useSetting("email-configured?");
  const canPickUserStrategy = PLUGIN_TENANTS.isEnabled;

  if (!isEmailConfigured) {
    return canPickUserStrategy ? (
      <PLUGIN_TENANTS.EditUserStrategySettingsButton page="people" />
    ) : null;
  }

  return (
    <Menu shadow="sm" position="bottom-end">
      <Menu.Target>
        <Tooltip label={t`People settings`}>
          <ActionIcon size="lg" aria-label={t`People settings`}>
            <Icon name="gear" />
          </ActionIcon>
        </Tooltip>
      </Menu.Target>
      <Menu.Dropdown>
        {canPickUserStrategy && (
          <PLUGIN_TENANTS.UserStrategyMenuItem page="people" />
        )}
        <Menu.Item
          component={ForwardRefLink}
          to={Urls.forcePasswordResetForEveryone()}
        >
          {t`Force password reset`}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
};
