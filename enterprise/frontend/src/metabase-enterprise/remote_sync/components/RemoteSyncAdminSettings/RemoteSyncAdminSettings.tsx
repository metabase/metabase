import { t } from "ttag";

import { SettingsPageWrapper } from "metabase/admin/components/SettingsSection";

import { RemoteSyncSettingsForm } from "./RemoteSyncSettingsForm";

export const RemoteSyncAdminSettings = () => {
  return (
    <SettingsPageWrapper
      title={t`Remote Sync`}
      description={t`Keep your dashboards, questions, and collections safely backed up in Git.`}
    >
      <RemoteSyncSettingsForm />
    </SettingsPageWrapper>
  );
};
