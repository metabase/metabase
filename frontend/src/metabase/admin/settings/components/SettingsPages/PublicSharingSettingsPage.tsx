import { t } from "ttag";

import { useSetting } from "metabase/common/hooks";

import { SettingsPageWrapper, SettingsSection } from "../SettingsSection";
import { AdminSettingInput } from "../widgets/AdminSettingInput";
import {
  PublicLinksActionListing,
  PublicLinksDashboardListing,
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
          <SettingsSection title={t`Shared action forms`}>
            <PublicLinksActionListing />
          </SettingsSection>
        </>
      )}
    </SettingsPageWrapper>
  );
}
