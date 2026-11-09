import { t } from "ttag";

import { SettingsPageWrapper } from "metabase/settings-components";

import { SettingsForm } from "../SettingsForm";

export const SettingsPage = () => (
  <SettingsPageWrapper
    title={t`Remote sync`}
    description={t`Keep your content in sync with a git repository.`}
  >
    <SettingsForm triggeredFrom="admin-settings" />
  </SettingsPageWrapper>
);
