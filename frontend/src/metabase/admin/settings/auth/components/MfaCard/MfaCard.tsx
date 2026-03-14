import { t } from "ttag";

import { useAdminSetting } from "metabase/api/utils";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useSelector } from "metabase/lib/redux";
import { getUser } from "metabase/selectors/user";
import { Anchor, Card, Group, Switch, Text, Title } from "metabase/ui";

export function MfaCard() {
  const {
    value: isRequired,
    updateSetting,
    isLoading,
  } = useAdminSetting("require-mfa");

  const currentUser = useSelector(getUser);
  const adminHasMfa = currentUser?.totp_enabled ?? false;

  if (isLoading) {
    return <LoadingAndErrorWrapper loading />;
  }

  return (
    <Card withBorder p="lg">
      <Group justify="space-between" align="flex-start">
        <div>
          <Title
            order={4}
            mb="xs"
          >{t`Two-factor authentication`}</Title>
          <Text
            c="text-secondary"
            fz="sm"
            maw={400}
          >{t`When enabled, all password-authenticated users must set up two-factor authentication. SSO users and API keys are exempt.`}</Text>
          {!adminHasMfa && !isRequired && (
            <Text c="error" fz="sm" mt="sm">
              {t`You must`}{" "}
              <Anchor
                href="/account/security"
              >{t`enable two-factor authentication on your own account`}</Anchor>{" "}
              {t`before requiring it for others.`}
            </Text>
          )}
        </div>
        <Switch
          checked={!!isRequired}
          disabled={!adminHasMfa && !isRequired}
          onChange={(e) =>
            updateSetting({
              key: "require-mfa",
              value: e.currentTarget.checked,
            })
          }
          aria-label={t`Require two-factor authentication`}
        />
      </Group>
    </Card>
  );
}
