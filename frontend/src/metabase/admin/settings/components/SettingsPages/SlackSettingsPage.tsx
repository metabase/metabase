import { t } from "ttag";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import { useSetting } from "metabase/common/hooks";
import { PLUGIN_METABOT } from "metabase/plugins";
import { Icon } from "metabase/ui";

import { SlackConfiguration } from "../../slack/SlackConfiguration";
import { SlackSetup } from "../../slack/SlackSetup";

export const SlackSettingsPage = () => {
  const slackAppToken = useSetting("slack-app-token");

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
          <SlackSetup
            hasCompletedSetup={!!slackAppToken}
            slackAppToken={slackAppToken}
          />
          <SlackConfiguration />
          <PLUGIN_METABOT.MetabotSlackSetup />
        </SettingsSection>
      </SettingsPageWrapper>
    </>
  );
};
