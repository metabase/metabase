import { t } from "ttag";

import { SettingsPageWrapper } from "metabase/admin/components/SettingsSection";
import { MetabotSlackSetup } from "metabase/metabot/components/MetabotAdmin/MetabotSlackSetup";
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
        <MetabotSlackSetup />
      </SettingsPageWrapper>
    </>
  );
};
