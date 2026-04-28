import { t } from "ttag";

import { SettingsPageWrapper } from "metabase/admin/components/SettingsSection";

export function DevelopmentInstancePage() {
  return (
    <SettingsPageWrapper
      title={t`Development instance`}
      description={t`Connect this instance to a workspace to iterate on transforms in isolation.`}
    >
      {null}
    </SettingsPageWrapper>
  );
}
