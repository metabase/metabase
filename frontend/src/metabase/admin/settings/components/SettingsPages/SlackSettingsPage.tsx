import { t } from "ttag";

import { MetabotSlackSetup } from "metabase/admin/ai/MetabotSlackSetup";
import { SettingsPageWrapper } from "metabase/admin/components/SettingsSection";
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
