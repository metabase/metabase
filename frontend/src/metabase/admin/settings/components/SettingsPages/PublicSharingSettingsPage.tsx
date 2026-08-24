import { t } from "ttag";

import { useSetting } from "metabase/settings";
import { AdminSettingInput } from "metabase/settings-components/AdminSettingInput";
import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/settings-components/SettingsSection";

import {
  PublicLinksActionListing,
  PublicLinksDashboardListing,
  PublicLinksDocumentListing,
  PublicLinksQuestionListing,
} from "../widgets/PublicLinksListing";

export function PublicSharingSettingsPage() {
  const publicSharingEnabled = useSetting("enable-public-sharing");
  return (
    <SettingsPageWrapper title={t`Public sharing`}>
      <SettingsSection>
        <AdminSettingInput
          name="enable-public-sharing"
          title={t`Enable Public Sharing`}
          inputType="boolean"
        />
      </SettingsSection>
      {publicSharingEnabled && (
        <>
          <SettingsSection title={t`Shared dashboards`}>
            <PublicLinksDashboardListing />
          </SettingsSection>
          <SettingsSection title={t`Shared questions`}>
            <PublicLinksQuestionListing />
          </SettingsSection>
          <SettingsSection title={t`Shared documents`}>
            <PublicLinksDocumentListing />
          </SettingsSection>
          <SettingsSection title={t`Shared action forms`}>
            <PublicLinksActionListing />
          </SettingsSection>
        </>
      )}
    </SettingsPageWrapper>
  );
}
