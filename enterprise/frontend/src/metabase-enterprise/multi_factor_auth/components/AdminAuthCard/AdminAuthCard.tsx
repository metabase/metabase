import dayjs from "dayjs";
import { msgid, ngettext, t } from "ttag";

import { SettingsSection } from "metabase/admin/components/SettingsSection";
import { Link } from "metabase/common/components/Link";
import { useHasTokenFeature } from "metabase/common/hooks";
import { getUserIsAdmin } from "metabase/current-user";
import { useSelector } from "metabase/redux";
import { useAdminSetting } from "metabase/settings";
import { Alert, Anchor, DateInput, Group, Select, Text } from "metabase/ui";
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

const DEADLINE_INPUT_FORMAT = "YYYY-MM-DD";

const toDeadlineSetting = (date: string | null) =>
  date ? dayjs(date).startOf("day").toISOString() : null;

const toDeadlineInput = (deadline: string | null | undefined) =>
  deadline ? dayjs(deadline).format(DEADLINE_INPUT_FORMAT) : null;

const DEFAULT_GRACE_PERIOD_DAYS = 14;

const getDefaultDeadline = () =>
  toDeadlineSetting(
    dayjs().add(DEFAULT_GRACE_PERIOD_DAYS, "day").format(DEADLINE_INPUT_FORMAT),
  );

const hasGracePeriodLeft = (deadline: string | null | undefined) =>
  deadline != null && dayjs(deadline).isAfter(dayjs());

export function AdminAuthCard() {
  const hasFeature = useHasTokenFeature("multi-factor-auth");
  const {
    value: enforcement,
    updateSetting,
    updateSettings,
  } = useAdminSetting("mfa-enforcement");
  const { value: deadline } = useAdminSetting("mfa-requirement-deadline");
  const { value: isPasswordLoginEnabled } = useAdminSetting(
    "enable-password-login",
  );
  const { value: isLdapEnabled } = useAdminSetting("ldap-enabled");

  const enabled = enforcement != null && enforcement !== "off";
  const isRequired = enforcement === "required";

  const { data: overview } = useGetMfaAdminOverviewQuery(undefined, {
    skip: !enabled,
  });

  // MFA only gates the password form, which LDAP users sign in through too, so there is nothing
  // to configure once both are off. Mirrors the provider filter in metabase-enterprise/auth.
  const hasNoPasswordLogin =
    isPasswordLoginEnabled === false && isLdapEnabled === false;

  if (hasNoPasswordLogin) {
    return null;
  }

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

    if (!option) {
      return;
    }

    if (option.value === "required" && !hasGracePeriodLeft(deadline)) {
      updateSettings({
        "mfa-enforcement": option.value,
        "mfa-requirement-deadline": getDefaultDeadline(),
      });
      return;
    }

    updateSetting({ key: "mfa-enforcement", value: option.value });
  };

  const handleDeadlineChange = (date: string | null) => {
    updateSetting({
      key: "mfa-requirement-deadline",
      value: toDeadlineSetting(date),
    });
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
      {isRequired && (
        <DateInput
          id="mfa-requirement-deadline"
          label={t`Enrollment deadline`}
          placeholder={t`Enrollment deadline`}
          description={t`Users must enroll before this date. Leave it empty to require two-factor authentication right away.`}
          value={toDeadlineInput(deadline)}
          onChange={handleDeadlineChange}
          minDate={dayjs().format(DEADLINE_INPUT_FORMAT)}
          disabled={!hasFeature}
          clearable
          clearButtonProps={{ "aria-label": t`Clear enrollment deadline` }}
          maw="20rem"
          data-1p-ignore // 1Password will cover the clear button without this.
        />
      )}
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
