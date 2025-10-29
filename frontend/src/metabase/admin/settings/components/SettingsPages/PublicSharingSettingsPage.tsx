import { t } from "ttag";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import { useHasTokenFeature, useSetting } from "metabase/common/hooks";
import { PLUGIN_PUBLIC_SHARING } from "metabase/plugins";

import { AdminSettingInput } from "../widgets/AdminSettingInput";
import {
  PublicLinksActionListing,
  PublicLinksDashboardListing,
  PublicLinksQuestionListing,
} from "../widgets/PublicLinksListing";

export function PublicSharingSettingsPage() {
  const publicSharingEnabled = useSetting("enable-public-sharing");
  const hasDocumentsFeature = useHasTokenFeature("documents");
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
          {hasDocumentsFeature &&
            PLUGIN_PUBLIC_SHARING.PublicLinksDocumentListing && (
              <SettingsSection title={t`Shared documents`}>
                <PLUGIN_PUBLIC_SHARING.PublicLinksDocumentListing />
              </SettingsSection>
            )}
          <SettingsSection title={t`Shared action forms`}>
            <PublicLinksActionListing />
          </SettingsSection>
        </>
      )}
    </SettingsPageWrapper>
  );
}
