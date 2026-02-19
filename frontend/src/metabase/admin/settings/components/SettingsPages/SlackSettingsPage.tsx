import { t } from "ttag";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import { PLUGIN_METABOT } from "metabase/plugins";
import { Icon } from "metabase/ui";

import { SlackConfiguration } from "../../slack/SlackConfiguration";
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
        <SettingsSection>
          <SlackSetup />
          <SlackConfiguration />
          <PLUGIN_METABOT.MetabotSlackSetup />
        </SettingsSection>
      </SettingsPageWrapper>
    </>
  );
};
