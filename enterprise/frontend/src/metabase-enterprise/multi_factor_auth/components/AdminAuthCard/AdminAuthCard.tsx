import dayjs from "dayjs";
import { msgid, ngettext, t } from "ttag";

import { SettingsSection } from "metabase/admin/components/SettingsSection";
import { Link } from "metabase/common/components/Link";
import { useHasTokenFeature } from "metabase/common/hooks";
import { getUserIsAdmin } from "metabase/current-user";
import { useSelector } from "metabase/redux";
import { useAdminSetting } from "metabase/settings";
import {
  Alert,
  Anchor,
  Box,
  DateInput,
  Group,
  Radio,
  Stack,
  Switch,
  Text,
} from "metabase/ui";
import { useGetMfaAdminOverviewQuery } from "metabase-enterprise/api";
import type { MfaAdminOverview } from "metabase-types/api";

import { ENROLLED_USERS_PATH, UNENROLLED_USERS_PATH } from "../../constants";

const ENFORCEMENT_OPTIONS = ["optional", "required", "required-date"] as const;
type EnforcementOption = (typeof ENFORCEMENT_OPTIONS)[number];

const isEnforcementOption = (value: unknown): value is EnforcementOption =>
  typeof value === "string" &&
  ENFORCEMENT_OPTIONS.some((option) => option === value);

const getEnforcementOptions = (): {
  value: EnforcementOption;
  label: string;
}[] => [
  { value: "optional", label: t`Don't require` },
  { value: "required", label: t`Require now` },
  { value: "required-date", label: t`Require by a certain date` },
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

  const { data: overview } = useGetMfaAdminOverviewQuery(undefined, {
    skip: !enabled,
  });

  const hasNoPasswordLogin =
    isPasswordLoginEnabled === false && isLdapEnabled === false;

  if (hasNoPasswordLogin) {
    return null;
  }

  if (!hasFeature && !enabled) {
    return null;
  }

  const handleEnable = (value: boolean) => {
    updateSettings({
      "mfa-enforcement": value ? "optional" : "off",
      "mfa-requirement-deadline": null,
    });
  };

  const handleRequire = (value: EnforcementOption) => {
    if (value === "optional") {
      updateSettings({
        "mfa-enforcement": "optional",
        "mfa-requirement-deadline": null,
      });
    } else if (value === "required-date") {
      updateSettings({
        "mfa-enforcement": "required",
        "mfa-requirement-deadline": getDefaultDeadline(),
      });
    } else if (value === "required") {
      updateSettings({
        "mfa-enforcement": "required",
        "mfa-requirement-deadline": null,
      });
    }
  };

  const getEnforcementValue = (): EnforcementOption => {
    if (enforcement === "optional") {
      return "optional";
    }
    if (enforcement === "required" && deadline !== null) {
      return "required-date";
    } else {
      return "required";
    }
  };

  const handleDeadlineChange = (date: string | null) => {
    updateSetting({
      key: "mfa-requirement-deadline",
      value: toDeadlineSetting(date),
    });
  };

  // Shared so the visible header and the group's accessible name can't drift apart.
  const enforcementLabel = t`Require two-factor authentication`;

  return (
    <SettingsSection
      data-testid="mfa-setting"
      title={t`Two-factor authentication`}
      description={t`Let users secure their account with an authenticator app.`}
    >
      <Switch
        label={t`Allow two-factor authentication`}
        checked={enforcement !== "off"}
        onChange={(event) => handleEnable(event.currentTarget.checked)}
        size="sm"
      />
      {enforcement !== "off" && (
        <Box>
          <Radio.Group
            label={enforcementLabel}
            labelProps={{ fw: "bold", mb: "sm" }}
            value={getEnforcementValue()}
            onChange={(value) =>
              isEnforcementOption(value) && handleRequire(value)
            }
          >
            <Stack gap="sm">
              {getEnforcementOptions().map(({ label, value }) => (
                <Radio
                  key={value}
                  value={value}
                  label={label}
                  // Without the feature the backend only accepts "off", which the switch above
                  // stays enabled for so a lapsed license can always be turned off.
                  disabled={!hasFeature}
                />
              ))}
            </Stack>
          </Radio.Group>
        </Box>
      )}
      {enforcement === "required" && deadline !== null && (
        <DateInput
          id="mfa-requirement-deadline"
          label={t`Enrollment deadline`}
          description={t`Users must enroll before this date`}
          value={toDeadlineInput(deadline)}
          onChange={handleDeadlineChange}
          minDate={dayjs().format(DEADLINE_INPUT_FORMAT)}
          disabled={!hasFeature}
          maw="20rem"
          data-1p-ignore // 1Password will try to fill this in for some reason
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
