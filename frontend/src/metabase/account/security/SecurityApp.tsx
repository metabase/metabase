import { useState } from "react";
import { t } from "ttag";

import {
  useConfirmMfaEnrollmentMutation,
  useDisableMfaMutation,
  useEnrollMfaMutation,
  useGetMfaStatusQuery,
  useUpdateMfaAdminSettingsMutation,
} from "metabase/api/session";
import { useSelector } from "metabase/redux";
import { getUser } from "metabase/selectors/user";
import {
  Box,
  Button,
  Card,
  Code,
  Loader,
  PasswordInput,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
} from "metabase/ui";

const CODE_LENGTH = 6;

const AdminControls = () => {
  const { data: status } = useGetMfaStatusQuery();
  const [updateAdminSettings] = useUpdateMfaAdminSettingsMutation();

  return (
    <Card withBorder mb="lg">
      <Title order={4} mb="sm">{t`Admin controls`}</Title>
      <Stack gap="sm">
        <Switch
          label={t`Enable two-factor authentication for this instance`}
          checked={Boolean(status?.enabled)}
          onChange={(event) =>
            updateAdminSettings({ enabled: event.currentTarget.checked })
          }
        />
        <Switch
          label={t`Require all email/password and LDAP users to set it up`}
          checked={Boolean(status?.required)}
          disabled={!status?.enabled}
          onChange={(event) =>
            updateAdminSettings({ required: event.currentTarget.checked })
          }
        />
      </Stack>
    </Card>
  );
};

const EnrollCard = () => {
  const [enrollMfa] = useEnrollMfaMutation();
  const [confirmEnrollment] = useConfirmMfaEnrollmentMutation();

  const [password, setPassword] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const [otpauthUri, setOtpauthUri] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleStart = async () => {
    setError(null);
    try {
      const result = await enrollMfa({ password }).unwrap();
      setSecret(result.secret);
      setOtpauthUri(result.otpauth_uri);
      setPassword("");
    } catch {
      setError(t`That password wasn't right.`);
    }
  };

  const handleConfirm = async () => {
    setError(null);
    try {
      await confirmEnrollment({ code }).unwrap();
    } catch {
      setError(t`That code didn't match. Try the current one.`);
    }
  };

  if (secret) {
    return (
      <Card withBorder>
        <Title order={4} mb="sm">{t`Finish setup`}</Title>
        <Text mb="xs">
          {t`Add this key to an authenticator app (Google Authenticator, 1Password, Authy…):`}
        </Text>
        <Code block mb="md">
          {secret}
        </Code>
        <Text size="sm" c="text-secondary" mb="xs">
          {t`Or open this setup link on the device running your authenticator:`}
        </Text>
        <Code block mb="md">
          {otpauthUri}
        </Code>
        <TextInput
          label={t`Enter the 6-digit code it shows`}
          value={code}
          onChange={(event) =>
            setCode(event.currentTarget.value.replace(/\D/g, ""))
          }
          placeholder="123456"
          maxLength={CODE_LENGTH}
          inputMode="numeric"
          error={error}
          mb="md"
        />
        <Button
          variant="filled"
          onClick={handleConfirm}
          disabled={code.length !== CODE_LENGTH}
        >
          {t`Confirm`}
        </Button>
      </Card>
    );
  }

  return (
    <Card withBorder>
      <Title order={4} mb="sm">{t`Set up two-factor authentication`}</Title>
      <Text mb="md">
        {t`Protect your account with a code from an authenticator app.`}
      </Text>
      <PasswordInput
        label={t`Confirm your password to begin`}
        value={password}
        onChange={(event) => setPassword(event.currentTarget.value)}
        error={error}
        mb="md"
      />
      <Button variant="filled" onClick={handleStart} disabled={!password}>
        {t`Set up`}
      </Button>
    </Card>
  );
};

const DisableCard = () => {
  const [disableMfa] = useDisableMfaMutation();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleDisable = async () => {
    setError(null);
    try {
      await disableMfa({ password }).unwrap();
      setPassword("");
    } catch {
      setError(t`That password wasn't right.`);
    }
  };

  return (
    <Card withBorder>
      <Text fw="bold" mb="sm">
        {t`Two-factor authentication is on for your account.`}
      </Text>
      <PasswordInput
        label={t`Confirm your password to turn it off`}
        value={password}
        onChange={(event) => setPassword(event.currentTarget.value)}
        error={error}
        mb="md"
      />
      <Button
        color="error"
        variant="filled"
        onClick={handleDisable}
        disabled={!password}
      >
        {t`Turn off`}
      </Button>
    </Card>
  );
};

export const SecurityApp = () => {
  const user = useSelector(getUser);
  const { data: status, isLoading } = useGetMfaStatusQuery();

  return (
    <Box maw={640} m="lg">
      <Title order={2} mb="lg">{t`Two-factor authentication`}</Title>

      {user?.is_superuser && <AdminControls />}

      {isLoading && <Loader />}

      {!isLoading && !status?.enabled && (
        <Text c="text-secondary">
          {t`Two-factor authentication is turned off for this instance.`}
        </Text>
      )}

      {!isLoading && status?.enabled && status.enrolled && <DisableCard />}

      {!isLoading && status?.enabled && !status.enrolled && <EnrollCard />}
    </Box>
  );
};
