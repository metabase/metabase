import { QRCodeSVG } from "qrcode.react";
import { type ChangeEvent, useCallback, useState } from "react";
import { t } from "ttag";

import { color } from "metabase/lib/colors";
import { MfaApi } from "metabase/services";
import {
  Alert,
  Box,
  Button,
  Code,
  Group,
  Stack,
  Text,
  TextInput,
  Title,
} from "metabase/ui";

function getApiError(e: unknown): string | undefined {
  const err = e as {
    data?: { message?: string; errors?: Record<string, string> };
  };
  if (err?.data?.errors) {
    const firstError = Object.values(err.data.errors)[0];
    if (firstError) {
      return firstError;
    }
  }
  return err?.data?.message;
}

interface MfaSetupProps {
  totpEnabled: boolean;
  onStatusChange: () => void;
}

type SetupStep = "idle" | "qr" | "verify" | "complete";

interface SetupData {
  secret: string;
  otpauth_uri: string;
  recovery_codes: string[];
}

export const MfaSetup = ({
  totpEnabled,
  onStatusChange,
}: MfaSetupProps): JSX.Element => {
  const [step, setStep] = useState<SetupStep>("idle");
  const [setupData, setSetupData] = useState<SetupData | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [setupPassword, setSetupPassword] = useState("");
  const [disablePassword, setDisablePassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showRecoveryCodes, setShowRecoveryCodes] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [regenPassword, setRegenPassword] = useState("");

  const handleStartSetup = useCallback(async () => {
    setError(null);
    setIsLoading(true);
    try {
      const data = await MfaApi.setup({ password: setupPassword });
      setSetupData(data);
      setSetupPassword("");
      setStep("qr");
    } catch (e: unknown) {
      setError(getApiError(e) ?? t`Failed to start setup`);
    } finally {
      setIsLoading(false);
    }
  }, [setupPassword]);

  const handleConfirm = useCallback(async () => {
    setError(null);
    setIsLoading(true);
    try {
      await MfaApi.confirm({ "totp-code": verifyCode });
      setStep("complete");
      onStatusChange();
    } catch (e: unknown) {
      setError(getApiError(e) ?? t`Invalid verification code`);
    } finally {
      setIsLoading(false);
    }
  }, [verifyCode, onStatusChange]);

  const handleDisable = useCallback(async () => {
    setError(null);
    setIsLoading(true);
    try {
      await MfaApi.disable({ password: disablePassword });
      onStatusChange();
    } catch (e: unknown) {
      setError(
        getApiError(e) ?? t`Failed to disable two-factor authentication`,
      );
    } finally {
      setIsLoading(false);
    }
  }, [disablePassword, onStatusChange]);

  const handleRegenerateRecoveryCodes = useCallback(async () => {
    setError(null);
    setIsLoading(true);
    try {
      const data = await MfaApi.regenerateRecoveryCodes({
        password: regenPassword,
      });
      setRecoveryCodes(data.recovery_codes);
      setShowRecoveryCodes(true);
      setRegenPassword("");
    } catch (e: unknown) {
      setError(getApiError(e) ?? t`Failed to regenerate recovery codes`);
    } finally {
      setIsLoading(false);
    }
  }, [regenPassword]);

  // Enrolled state
  if (totpEnabled && step !== "complete") {
    return (
      <Stack gap="lg">
        <Title order={2}>{t`Two-factor authentication`}</Title>
        <Alert color="success" title={t`Enabled`}>
          {t`Two-factor authentication is enabled for your account.`}
        </Alert>

        {showRecoveryCodes && recoveryCodes && (
          <Box>
            <Text fw="bold" mb="sm">
              {t`New recovery codes`}
            </Text>
            <Text c="text-secondary" mb="sm">
              {t`Save these codes in a safe place. Each code can only be used once.`}
            </Text>
            <Code block>{recoveryCodes.join("\n")}</Code>
          </Box>
        )}

        {!showRecoveryCodes && (
          <Box>
            <Text fw="bold" mb="sm">
              {t`Regenerate recovery codes`}
            </Text>
            <Group>
              <TextInput
                type="password"
                placeholder={t`Current password`}
                value={regenPassword}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setRegenPassword(e.currentTarget.value)
                }
              />
              <Button
                variant="outline"
                onClick={handleRegenerateRecoveryCodes}
                loading={isLoading}
                disabled={!regenPassword}
              >
                {t`Regenerate`}
              </Button>
            </Group>
          </Box>
        )}

        <Box>
          <Text fw="bold" mb="sm">
            {t`Disable two-factor authentication`}
          </Text>
          <Group>
            <TextInput
              type="password"
              placeholder={t`Current password`}
              value={disablePassword}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setDisablePassword(e.currentTarget.value)
              }
            />
            <Button
              variant="outline"
              color="danger"
              onClick={handleDisable}
              loading={isLoading}
              disabled={!disablePassword}
            >
              {t`Disable`}
            </Button>
          </Group>
        </Box>

        {error && <Alert color="error">{error}</Alert>}
      </Stack>
    );
  }

  // Setup complete state (just enabled)
  if (step === "complete" && setupData) {
    return (
      <Stack gap="lg">
        <Title order={2}>{t`Two-factor authentication`}</Title>
        <Alert color="success" title={t`Setup complete`}>
          {t`Two-factor authentication has been enabled for your account.`}
        </Alert>
        <Box>
          <Text fw="bold" mb="sm">
            {t`Recovery codes`}
          </Text>
          <Text c="text-secondary" mb="sm">
            {t`Save these codes in a safe place. Each code can only be used once. If you lose access to your authenticator app, you can use these codes to sign in.`}
          </Text>
          <Code block>{setupData.recovery_codes.join("\n")}</Code>
        </Box>
      </Stack>
    );
  }

  // QR code display + verification step
  if (step === "qr" && setupData) {
    return (
      <Stack gap="lg">
        <Title order={2}>{t`Set up two-factor authentication`}</Title>
        <Text>
          {t`Scan this QR code with your authenticator app (such as Google Authenticator or Authy).`}
        </Text>
        <Box
          style={{
            display: "flex",
            justifyContent: "center",
          }}
        >
          <Box
            p="md"
            style={{
              backgroundColor: color("white"),
              borderRadius: "var(--mantine-radius-sm)",
              lineHeight: 0,
            }}
          >
            <QRCodeSVG value={setupData.otpauth_uri} size={200} />
          </Box>
        </Box>
        <Box>
          <Text fz="sm" c="text-secondary" mb="xs">
            {t`Or enter this secret manually:`}
          </Text>
          <Code>{setupData.secret}</Code>
        </Box>
        <Box>
          <Text fw="bold" mb="sm">
            {t`Verify setup`}
          </Text>
          <Text c="text-secondary" mb="sm">
            {t`Enter the 6-digit code from your authenticator app to confirm setup.`}
          </Text>
          <Group>
            <TextInput
              placeholder="000000"
              inputMode="numeric"
              maxLength={6}
              value={verifyCode}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setVerifyCode(e.currentTarget.value)
              }
              autoFocus
            />
            <Button
              variant="filled"
              onClick={handleConfirm}
              loading={isLoading}
              disabled={verifyCode.length !== 6}
            >
              {t`Verify and enable`}
            </Button>
          </Group>
        </Box>

        <Box>
          <Text fw="bold" mb="sm">
            {t`Recovery codes`}
          </Text>
          <Text c="text-secondary" mb="sm">
            {t`Save these codes now. They will be shown again after setup is complete, but this is your first chance to copy them.`}
          </Text>
          <Code block>{setupData.recovery_codes.join("\n")}</Code>
        </Box>

        {error && <Alert color="error">{error}</Alert>}
      </Stack>
    );
  }

  // Idle state — not enrolled
  return (
    <Stack gap="lg">
      <Title order={2}>{t`Two-factor authentication`}</Title>
      <Text>
        {t`Add an extra layer of security to your account by requiring a verification code from an authenticator app when you sign in.`}
      </Text>
      <Box>
        <Group>
          <TextInput
            type="password"
            placeholder={t`Current password`}
            value={setupPassword}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setSetupPassword(e.currentTarget.value)
            }
          />
          <Button
            variant="filled"
            onClick={handleStartSetup}
            loading={isLoading}
            disabled={!setupPassword}
          >
            {t`Enable two-factor authentication`}
          </Button>
        </Group>
      </Box>
      {error && <Alert color="error">{error}</Alert>}
    </Stack>
  );
};
