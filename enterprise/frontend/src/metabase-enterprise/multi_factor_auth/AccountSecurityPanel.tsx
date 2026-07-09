import { useState } from "react";
import { t } from "ttag";

import {
  Box,
  Button,
  Card,
  Code,
  Group,
  Loader,
  PasswordInput,
  Text,
  TextInput,
  Title,
} from "metabase/ui";
import {
  useConfirmMfaEnrollmentMutation,
  useDisableMfaMutation,
  useEnrollMfaMutation,
  useGetMfaStatusQuery,
  useRegenerateRecoveryCodesMutation,
} from "metabase-enterprise/api";

const TOTP_CODE_LENGTH = 6;
const LOW_RECOVERY_CODES = 3;

const downloadCodes = (codes: string[]) => {
  const blob = new Blob([codes.join("\n") + "\n"], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "metabase-recovery-codes.txt";
  link.click();
  URL.revokeObjectURL(url);
};

/** Shown exactly once, right after codes are generated. Must be acknowledged to dismiss. */
const RecoveryCodesPanel = ({
  codes,
  onAcknowledge,
}: {
  codes: string[];
  onAcknowledge: () => void;
}) => (
  <Card withBorder>
    <Title order={4} mb="sm">{t`Save your recovery codes`}</Title>
    <Text mb="md">
      {t`Each code signs you in once if you lose your authenticator. This is the only time they will be shown.`}
    </Text>
    <Code block mb="md">
      {codes.join("\n")}
    </Code>
    <Group mb="md">
      <Button onClick={() => navigator.clipboard.writeText(codes.join("\n"))}>
        {t`Copy`}
      </Button>
      <Button
        onClick={() => downloadCodes(codes)}
      >{t`Download as .txt`}</Button>
    </Group>
    <Button variant="filled" onClick={onAcknowledge}>
      {t`I've saved these`}
    </Button>
  </Card>
);

const EnrollCard = ({
  onRecoveryCodes,
}: {
  onRecoveryCodes: (codes: string[]) => void;
}) => {
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
      const { recovery_codes } = await confirmEnrollment({ code }).unwrap();
      onRecoveryCodes(recovery_codes);
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
        {/* TODO(FE handoff): render this as a QR code (design calls for react-qr-code) */}
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
          maxLength={TOTP_CODE_LENGTH}
          inputMode="numeric"
          error={error}
          mb="md"
        />
        <Button
          variant="filled"
          onClick={handleConfirm}
          disabled={code.length !== TOTP_CODE_LENGTH}
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

const EnrolledCard = ({
  recoveryCodesRemaining,
  onRecoveryCodes,
}: {
  recoveryCodesRemaining: number;
  onRecoveryCodes: (codes: string[]) => void;
}) => {
  const [disableMfa] = useDisableMfaMutation();
  const [regenerate] = useRegenerateRecoveryCodesMutation();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const withCode = async (action: () => Promise<void>) => {
    setError(null);
    try {
      await action();
      setCode("");
    } catch {
      setError(
        t`That code didn't work. Enter a current code or an unused recovery code.`,
      );
    }
  };

  return (
    <Card withBorder>
      <Text fw="bold" mb="sm">
        {t`Two-factor authentication is on for your account.`}
      </Text>
      <Text
        mb="md"
        c={
          recoveryCodesRemaining <= LOW_RECOVERY_CODES
            ? "error"
            : "text-secondary"
        }
      >
        {t`${recoveryCodesRemaining} recovery codes remaining.`}
        {recoveryCodesRemaining <= LOW_RECOVERY_CODES &&
          " " + t`Generate a new set soon.`}
      </Text>
      <TextInput
        label={t`Confirm with an authenticator code or a recovery code`}
        value={code}
        onChange={(event) => setCode(event.currentTarget.value)}
        placeholder="123456"
        error={error}
        mb="md"
      />
      <Group>
        <Button
          onClick={() =>
            withCode(async () => {
              const { codes } = await regenerate({
                code: code.trim(),
              }).unwrap();
              onRecoveryCodes(codes);
            })
          }
          disabled={!code}
        >
          {t`New recovery codes`}
        </Button>
        <Button
          color="error"
          variant="filled"
          onClick={() =>
            withCode(async () => {
              await disableMfa({ code: code.trim() }).unwrap();
            })
          }
          disabled={!code}
        >
          {t`Turn off`}
        </Button>
      </Group>
    </Card>
  );
};

export const AccountSecurityPanel = () => {
  const { data: status, isLoading } = useGetMfaStatusQuery();
  const [freshRecoveryCodes, setFreshRecoveryCodes] = useState<string[] | null>(
    null,
  );

  if (isLoading || !status) {
    return <Loader m="lg" />;
  }

  return (
    <Box maw={640} m="lg">
      <Title order={2} mb="lg">{t`Two-factor authentication`}</Title>

      {freshRecoveryCodes ? (
        <RecoveryCodesPanel
          codes={freshRecoveryCodes}
          onAcknowledge={() => setFreshRecoveryCodes(null)}
        />
      ) : !status.mfa_enabled ? (
        <Text c="text-secondary">
          {t`Two-factor authentication is turned off for this instance.`}
        </Text>
      ) : status.enrolled ? (
        <EnrolledCard
          recoveryCodesRemaining={status.recovery_codes_remaining}
          onRecoveryCodes={setFreshRecoveryCodes}
        />
      ) : (
        <EnrollCard onRecoveryCodes={setFreshRecoveryCodes} />
      )}
    </Box>
  );
};
