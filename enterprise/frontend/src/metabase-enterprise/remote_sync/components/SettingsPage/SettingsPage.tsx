import { t } from "ttag";

import { SettingsPageWrapper } from "metabase/settings-components";

import { SettingsForm } from "../SettingsForm";

export const SettingsPage = () => (
  <SettingsPageWrapper
    title={t`Remote sync`}
    description={t`Keep your dashboards, questions, and collections safely backed up in Git.`}
  >
    <SettingsForm triggeredFrom="admin-settings" />
  </SettingsPageWrapper>
);
