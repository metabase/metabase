import { t } from "ttag";

import { SettingsPageWrapper } from "metabase/settings-components";
import { Text } from "metabase/ui";

export function DataIsolationPage() {
  return (
    <SettingsPageWrapper title={t`Data isolation`}>
      {/* PROTOTYPE: placeholder until DB routing and sandboxing controls move here */}
      <Text>{t`DB routing and sandboxing stuff goes here`}</Text>
    </SettingsPageWrapper>
  );
}
