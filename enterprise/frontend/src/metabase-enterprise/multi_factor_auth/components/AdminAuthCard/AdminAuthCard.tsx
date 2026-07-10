import { msgid, ngettext, t } from "ttag";

import { useAdminSetting } from "metabase/api/utils";
import { useHasTokenFeature } from "metabase/common/hooks";
import { Alert, Card, Stack, Switch, Text, Title } from "metabase/ui";
import { useGetMfaAdminOverviewQuery } from "metabase-enterprise/api";

export const MfaAuthCard = () => {
  const hasFeature = useHasTokenFeature("multi-factor-auth");
  const { value: enabled, updateSetting } = useAdminSetting("mfa-enabled");
  const { data: overview } = useGetMfaAdminOverviewQuery(undefined, {
    skip: !enabled,
  });

  // Feature gone AND setting off: nothing to manage, nothing to sell here.
  if (!hasFeature && !enabled) {
    return null;
  }

  const enrolledCount = overview?.enrolled_count ?? 0;
  const unenrolledCount = overview?.unenrolled_count ?? 0;

  return (
    <Card withBorder>
      <Title order={4} mb="sm">{t`Two-factor authentication`}</Title>
      <Stack gap="sm">
        <Switch
          label={t`Let users secure their account with an authenticator app`}
          checked={Boolean(enabled)}
          // turning ON requires the feature; turning OFF always works (license-lapse escape hatch)
          disabled={!enabled && !hasFeature}
          onChange={(event) =>
            updateSetting({
              key: "mfa-enabled",
              value: event.currentTarget.checked,
            })
          }
        />
        {Boolean(enabled) && overview && !overview.encryption_key_set && (
          <Alert color="warning">
            {t`MB_ENCRYPTION_SECRET_KEY is not set, so authenticator secrets are stored unencrypted. Setting one is strongly recommended.`}
          </Alert>
        )}
        {Boolean(enabled) && overview && (
          <Text c="text-secondary" size="sm">
            {ngettext(
              msgid`${enrolledCount} user enrolled, ${unenrolledCount} without two-factor authentication.`,
              `${enrolledCount} users enrolled, ${unenrolledCount} without two-factor authentication.`,
              enrolledCount,
            )}
          </Text>
        )}
      </Stack>
    </Card>
  );
};
