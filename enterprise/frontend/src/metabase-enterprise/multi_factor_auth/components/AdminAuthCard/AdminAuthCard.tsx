import { msgid, ngettext, t } from "ttag";

import { SettingsSection } from "metabase/admin/components/SettingsSection";
import { useAdminSetting } from "metabase/api/utils";
import { Link } from "metabase/common/components/Link";
import { useHasTokenFeature } from "metabase/common/hooks";
import { useSelector } from "metabase/redux";
import { getUserIsAdmin } from "metabase/selectors/user";
import { Alert, Anchor, Group, Switch, Text } from "metabase/ui";
import { useGetMfaAdminOverviewQuery } from "metabase-enterprise/api";
import type { MfaAdminOverview } from "metabase-types/api";

import { ENROLLED_USERS_PATH, UNENROLLED_USERS_PATH } from "../../constants";

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
    <SettingsSection
      data-testid="mfa-setting"
      title={t`Two-factor authentication`}
      description={t`Let users secure their account with an authenticator app.`}
    >
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
        <Alert size="compact" color="warning">
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
  const isAdmin = useSelector(getUserIsAdmin);
  const enrolledCount = overview.enrolled_count;
  const unenrolledCount = overview.unenrolled_count;

  const enrolledLabel = ngettext(
    msgid`${enrolledCount} enrolled user`,
    `${enrolledCount} enrolled users`,
    enrolledCount,
  );
  const unenrolledLabel = ngettext(
    msgid`${unenrolledCount} user without 2FA`,
    `${unenrolledCount} users without 2FA`,
    unenrolledCount,
  );

  if (!isAdmin) {
    return (
      <Group gap="sm">
        <Text c="text-secondary">{enrolledLabel}</Text>
        <Text c="text-secondary">•</Text>
        <Text c="text-secondary">{unenrolledLabel}</Text>
      </Group>
    );
  }

  return (
    <Group gap="sm">
      <Anchor component={Link} to={ENROLLED_USERS_PATH}>
        {enrolledLabel}
      </Anchor>
      <Text c="text-secondary">•</Text>
      <Anchor component={Link} to={UNENROLLED_USERS_PATH}>
        {unenrolledLabel}
      </Anchor>
    </Group>
  );
}
