import { t } from "ttag";

import { useAdminSetting } from "metabase/api/utils";
import Breadcrumbs from "metabase/components/Breadcrumbs";
import { LoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper";
import { Stack, Title } from "metabase/ui";

import { SettingsSection } from "../components/SettingsSection";

import { SlackSetup } from "./SlackSetup";
import { SlackStatus } from "./SlackStatus";

export const SlackSettingsPage = () => {
  const { value: isApp, isLoading } = useAdminSetting("slack-app-token");

  if (isLoading) {
    return <LoadingAndErrorWrapper />;
  }

  return (
    <Stack>
      <Title order={1}>{t`Metabase on Slack`}</Title>
      <Breadcrumbs
        crumbs={[
          [t`Notification channels`, "/admin/settings/notifications"],
          ["Slack"],
        ]}
      />
      <SettingsSection>
        {isApp ? <SlackStatus /> : <SlackSetup />}
      </SettingsSection>
    </Stack>
  );
};
