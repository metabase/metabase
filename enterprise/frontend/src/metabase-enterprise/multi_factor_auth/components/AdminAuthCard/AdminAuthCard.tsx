import { useState } from "react";
import { c, msgid, ngettext, t } from "ttag";

import { SettingsSection } from "metabase/admin/components/SettingsSection";
import { SettingHeader } from "metabase/admin/settings/components/SettingHeader";
import { useAdminSetting } from "metabase/api/utils";
import { useHasTokenFeature } from "metabase/common/hooks";
import { Alert, Collapse, Switch, Text, UnstyledButton } from "metabase/ui";
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
    <SettingsSection>
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
  const [showUnenrolled, setShowUnenrolled] = useState(false);
  const enrolledCount = overview.enrolled_count;
  const unenrolledCount = overview.unenrolled_count;
  const unenrolledUsers = overview.unenrolled_users;
  const remainingCount = unenrolledCount - unenrolledUsers.length;

  return (
    <>
      <Text c="text-secondary" lh="xl" maw="38rem">
        {ngettext(
          msgid`${enrolledCount} user enrolled, ${unenrolledCount} without two-factor authentication.`,
          `${enrolledCount} users enrolled, ${unenrolledCount} without two-factor authentication.`,
          enrolledCount,
        )}
      </Text>
      {unenrolledUsers.length > 0 && (
        <>
          <UnstyledButton
            c="brand"
            fz="sm"
            onClick={() => setShowUnenrolled(!showUnenrolled)}
          >
            {showUnenrolled
              ? t`Hide users without two-factor authentication`
              : t`Show users without two-factor authentication`}
          </UnstyledButton>
          <Collapse in={showUnenrolled}>
            <Text component="ul" c="text-secondary" fz="sm" lh="lg" m={0}>
              {unenrolledUsers.map((user) => (
                <li key={user.id}>{user.email}</li>
              ))}
              {remainingCount > 0 && (
                <li>
                  {c("{0} is a number of additional users not shown")
                    .t`…and ${remainingCount} more`}
                </li>
              )}
            </Text>
          </Collapse>
        </>
      )}
    </>
  );
}
