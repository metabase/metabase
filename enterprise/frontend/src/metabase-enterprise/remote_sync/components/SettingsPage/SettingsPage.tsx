import { t } from "ttag";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/settings-components";

import { SettingsForm } from "../SettingsForm";
import { SyncActionsSection } from "../SyncActionsSection";

export const SettingsPage = () => (
  <SettingsPageWrapper
    title={t`Remote sync`}
    description={t`Keep your content in sync with a git repository.`}
  >
    <SettingsSection>
      <SettingsForm triggeredFrom="admin-settings" />
    </SettingsSection>
    <SyncActionsSection />
  </SettingsPageWrapper>
);
