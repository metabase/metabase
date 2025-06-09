import { t } from "ttag";

import { useAdminSetting } from "metabase/api/utils";
import Breadcrumbs from "metabase/components/Breadcrumbs";
import { LoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper";
import { Stack } from "metabase/ui";

import { SlackSetup } from "./SlackSetup";
import { SlackStatus } from "./SlackStatus";

export const SlackSettingsPage = () => {
  const { value: isApp, isLoading } = useAdminSetting("slack-app-token");

  if (isLoading) {
    return <LoadingAndErrorWrapper />;
  }

  return (
    <Stack>
      <Breadcrumbs
        crumbs={[
          [t`Notification channels`, "/admin/settings/notifications"],
          ["Slack"],
        ]}
      />
      {isApp ? <SlackStatus /> : <SlackSetup />}
    </Stack>
  );
};
