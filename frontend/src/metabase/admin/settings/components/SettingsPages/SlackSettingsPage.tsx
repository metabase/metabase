import { t } from "ttag";

import { SettingsPageWrapper } from "metabase/admin/components/SettingsSection";
import { PLUGIN_METABOT } from "metabase/plugins";
import { Icon } from "metabase/ui";

import { SlackSetup } from "../../slack/SlackSetup";

export const SlackSettingsPage = () => {
  return (
    <>
      <SettingsPageWrapper
        title={
          <>
            <Icon name="slack_colorized" size={22} mr="sm" /> {t`Slack`}
          </>
        }
      >
        <SlackSetup />
        <PLUGIN_METABOT.MetabotSlackSetup />
      </SettingsPageWrapper>
    </>
  );
};
