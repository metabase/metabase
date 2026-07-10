import { msgid, ngettext, t } from "ttag";

import { SettingsSection } from "metabase/admin/components/SettingsSection";
import { AdminSettingInput } from "metabase/admin/settings/components/widgets/AdminSettingInput";
import { useAdminSetting } from "metabase/api/utils";
import { useHasTokenFeature } from "metabase/common/hooks";
import { Alert, Text } from "metabase/ui";
import { useGetMfaAdminOverviewQuery } from "metabase-enterprise/api";
import type { MfaAdminOverview } from "metabase-types/api";

export const AdminAuthCard = () => {
  const hasFeature = useHasTokenFeature("multi-factor-auth");
  const { value: enabled } = useAdminSetting("mfa-enabled");
  const { data: overview } = useGetMfaAdminOverviewQuery(undefined, {
    skip: !enabled,
  });

  // Feature gone AND setting off: nothing to manage, nothing to sell here.
  if (!hasFeature && !enabled) {
    return null;
  }

  return (
    <SettingsSection>
      <AdminSettingInput
        name="mfa-enabled"
        inputType="boolean"
        title={t`Two-factor authentication`}
        description={t`Let users secure their account with an authenticator app.`}
        // turning ON requires the feature; turning OFF always works (license-lapse escape hatch)
        disabled={!enabled && !hasFeature}
      />
      {enabled && overview && !overview.encryption_key_set && (
        <Alert color="warning">
          {t`Set MB_ENCRYPTION_SECRET_KEY to avoid storing authenticator secrets unencrypted.`}
        </Alert>
      )}
      {enabled && overview && <EnrollmentCounts overview={overview} />}
    </SettingsSection>
  );
};

type EnrollmentCountsProps = {
  overview: MfaAdminOverview;
};

function EnrollmentCounts({ overview }: EnrollmentCountsProps) {
  const enrolledCount = overview.enrolled_count;
  const unenrolledCount = overview.unenrolled_count;

  return (
    <Text c="text-secondary" lh="xl" maw="38rem">
      {ngettext(
        msgid`${enrolledCount} user enrolled, ${unenrolledCount} without two-factor authentication.`,
        `${enrolledCount} users enrolled, ${unenrolledCount} without two-factor authentication.`,
        enrolledCount,
      )}
    </Text>
  );
}
