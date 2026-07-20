import { msgid, ngettext, t } from "ttag";

import { SettingsSection } from "metabase/admin/components/SettingsSection";
import { SettingHeader } from "metabase/admin/settings/components/SettingHeader";
import { useAdminSetting } from "metabase/api/utils";
import { useHasTokenFeature } from "metabase/common/hooks";
import { Alert, Group, Switch, Text } from "metabase/ui";
import { useGetMfaAdminOverviewQuery } from "metabase-enterprise/api";
import type { MfaAdminOverview } from "metabase-types/api";

export function AdminAuthCard() {
  const hasFeature = useHasTokenFeature("multi-factor-auth");
  const { value: enforcement, updateSetting } =
    useAdminSetting("mfa-enforcement");

  const enabled = enforcement != null && enforcement !== "off";

  const { data: overview } = useGetMfaAdminOverviewQuery(undefined, {
    skip: !enabled,
  });

  if (!hasFeature && !enabled) {
    return null;
  }

  const handleChange = (checked: boolean) => {
    updateSetting({
      key: "mfa-enforcement",
      value: checked ? "optional" : "off",
    });
  };

  return (
    <SettingsSection data-testid="mfa-setting">
      <SettingHeader
        id="mfa-enforcement"
        title={t`Two-factor authentication`}
        description={t`Let users secure their account with an authenticator app.`}
      />
      <Switch
        id="mfa-enforcement"
        checked={enabled}
        onChange={(e) => handleChange(e.target.checked)}
        label={enabled ? t`Enabled` : t`Disabled`}
        disabled={!enabled && !hasFeature}
        w="auto"
        size="sm"
      />
      {enabled && overview && !overview.encryption_key_set && (
        <Alert color="warning">
          {t`Make sure to set the MB_ENCRYPTION_SECRET_KEY environment variable to encrypt authenticator secrets.`}
        </Alert>
      )}
      {enabled && overview && <EnrollmentCounts overview={overview} />}
    </SettingsSection>
  );
}

type EnrollmentCountsProps = {
  overview: MfaAdminOverview;
};

function EnrollmentCounts({ overview }: EnrollmentCountsProps) {
  const enrolledCount = overview.enrolled_count;
  const unenrolledCount = overview.unenrolled_count;

  return (
    <Group gap="sm">
      <Text c="text-secondary">
        {ngettext(
          msgid`${enrolledCount} enrolled user`,
          `${enrolledCount} enrolled users`,
          enrolledCount,
        )}
      </Text>
      <Text c="text-secondary">•</Text>
      <Text c="text-secondary">
        {ngettext(
          msgid`${unenrolledCount} user without 2FA`,
          `${unenrolledCount} users without 2FA`,
          unenrolledCount,
        )}
      </Text>
    </Group>
  );
}
