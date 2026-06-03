import { t } from "ttag";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import { useSetting } from "metabase/common/hooks";

import { AdminSettingInput } from "../widgets/AdminSettingInput";
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
        {publicSharingEnabled && (
          <AdminSettingInput
            name="show-public-link-admin-prompt"
            title={t`Show "ask your admin" prompt`}
            description={t`When enabled, non-admin users without a public link see a prompt to ask an admin to create one. This does not change who can create public links.`}
            inputType="boolean"
          />
        )}
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
