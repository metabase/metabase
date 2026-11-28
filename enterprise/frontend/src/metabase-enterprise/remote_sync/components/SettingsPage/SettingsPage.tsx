import { t } from "ttag";

import { SettingsPageWrapper } from "metabase/settings-components";

import { SettingsForm } from "../SettingsForm";

export function SettingsPage() {
  return (
    <SettingsPageWrapper
      title={t`Git integration`}
      description={t`Pull in content from a connected git repository.`}
    >
      <SettingsForm triggeredFrom="admin-settings" />
    </SettingsPageWrapper>
  );
}
