import { msgid, ngettext, t } from "ttag";

import { SettingsSection } from "metabase/admin/components/SettingsSection";
import { useAdminSetting } from "metabase/api/utils";
import { Link } from "metabase/common/components/Link";
import { useHasTokenFeature } from "metabase/common/hooks";
import { useSelector } from "metabase/redux";
import { getUserIsAdmin } from "metabase/selectors/user";
import { Alert, Anchor, Group, Select, Text } from "metabase/ui";
import { useGetMfaAdminOverviewQuery } from "metabase-enterprise/api";
import type { MfaAdminOverview, MfaEnforcement } from "metabase-types/api";

import { ENROLLED_USERS_PATH, UNENROLLED_USERS_PATH } from "../../constants";

type EnforcementOption = {
  value: MfaEnforcement;
  label: string;
};

const getEnforcementOptions = (): EnforcementOption[] => [
  { value: "off", label: t`Off` },
  { value: "optional", label: t`Optional` },
  { value: "required", label: t`Required` },
];

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

  // Any value other than "off" needs the token, but "off" stays selectable so a lapsed
  // licence can always be wound back down.
  const options = getEnforcementOptions().map((option) => ({
    ...option,
    disabled: option.value !== "off" && !hasFeature,
  }));

  const handleChange = (value: string | null) => {
    const option = options.find((option) => option.value === value);

    if (option) {
      updateSetting({ key: "mfa-enforcement", value: option.value });
    }
  };

  return (
    <SettingsSection
      data-testid="mfa-setting"
      title={t`Two-factor authentication`}
      description={t`Let users secure their account with an authenticator app.`}
    >
      <Select
        id="mfa-enforcement"
        label={t`Enforcement`}
        data={options}
        value={enforcement ?? "off"}
        onChange={handleChange}
        maw="20rem"
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
