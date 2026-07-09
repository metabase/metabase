import { type FormEvent, useState } from "react";
import { msgid, ngettext, t } from "ttag";

import { getErrorMessage } from "metabase/api/utils";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import {
  Box,
  Button,
  Card,
  Code,
  Group,
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

import { TOTP_CODE_LENGTH } from "./constants";

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
}) => {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle",
  );

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };

  return (
    <Card withBorder>
      <Title order={4} mb="sm">{t`Save your recovery codes`}</Title>
      <Text mb="md">
        {t`Each code signs you in once if you lose your authenticator. This is the only time they will be shown.`}
      </Text>
      <Code block mb="md">
        {codes.join("\n")}
      </Code>
      <Group mb="md">
        <Button onClick={handleCopy}>
          {copyState === "copied" ? t`Copied` : t`Copy`}
        </Button>
        <Button
          onClick={() => downloadCodes(codes)}
        >{t`Download as .txt`}</Button>
      </Group>
      {copyState === "failed" && (
        <Text c="error" mb="md">
          {t`Couldn't copy to the clipboard. Select the codes above and copy them manually.`}
        </Text>
      )}
      <Button variant="filled" onClick={onAcknowledge}>
        {t`I've saved these`}
      </Button>
    </Card>
  );
};

const EnrollCard = ({
  onRecoveryCodes,
}: {
  onRecoveryCodes: (codes: string[]) => void;
}) => {
  const [enrollMfa, { isLoading: isEnrolling }] = useEnrollMfaMutation();
  const [confirmEnrollment, { isLoading: isConfirming }] =
    useConfirmMfaEnrollmentMutation();

  const [password, setPassword] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const [otpauthUri, setOtpauthUri] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleStart = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      const result = await enrollMfa({ password }).unwrap();
      setSecret(result.secret);
      setOtpauthUri(result.otpauth_uri);
      setPassword("");
    } catch (enrollError) {
      setError(getErrorMessage(enrollError, t`That password wasn't right.`));
    }
  };

  const handleConfirm = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      const { recovery_codes } = await confirmEnrollment({ code }).unwrap();
      onRecoveryCodes(recovery_codes);
    } catch (confirmError) {
      setError(
        getErrorMessage(
          confirmError,
          t`That code didn't match. Try the current one.`,
        ),
      );
    }
  };

  if (secret) {
    return (
      <Card withBorder>
        <Box component="form" onSubmit={handleConfirm}>
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
            type="submit"
            variant="filled"
            loading={isConfirming}
            disabled={code.length !== TOTP_CODE_LENGTH}
          >
            {t`Confirm`}
          </Button>
        </Box>
      </Card>
    );
  }

  return (
    <Card withBorder>
      <Box component="form" onSubmit={handleStart}>
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
        <Button
          type="submit"
          variant="filled"
          loading={isEnrolling}
          disabled={!password}
        >
          {t`Set up`}
        </Button>
      </Box>
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
  const [disableMfa, { isLoading: isDisabling }] = useDisableMfaMutation();
  const [regenerate, { isLoading: isRegenerating }] =
    useRegenerateRecoveryCodesMutation();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const isLowOnCodes = recoveryCodesRemaining <= LOW_RECOVERY_CODES;

  const withCode = async (action: () => Promise<void>) => {
    setError(null);
    try {
      await action();
      setCode("");
    } catch (actionError) {
      setError(
        getErrorMessage(
          actionError,
          t`That code didn't work. Enter a current code or an unused recovery code.`,
        ),
      );
    }
  };

  const handleRegenerate = (event: FormEvent) => {
    event.preventDefault();
    withCode(async () => {
      const { codes } = await regenerate({ code: code.trim() }).unwrap();
      onRecoveryCodes(codes);
    });
  };

  return (
    <Card withBorder>
      <Box component="form" onSubmit={handleRegenerate}>
        <Text fw="bold" mb="sm">
          {t`Two-factor authentication is on for your account.`}
        </Text>
        <Text mb="md" c={isLowOnCodes ? "error" : "text-secondary"}>
          {ngettext(
            msgid`${recoveryCodesRemaining} recovery code remaining.`,
            `${recoveryCodesRemaining} recovery codes remaining.`,
            recoveryCodesRemaining,
          )}{" "}
          {isLowOnCodes && t`Generate a new set soon.`}
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
            type="submit"
            loading={isRegenerating}
            disabled={!code || isDisabling}
          >
            {t`New recovery codes`}
          </Button>
          <Button
            type="button"
            color="error"
            variant="filled"
            loading={isDisabling}
            onClick={() =>
              withCode(async () => {
                await disableMfa({ code: code.trim() }).unwrap();
              })
            }
            disabled={!code || isRegenerating}
          >
            {t`Turn off`}
          </Button>
        </Group>
      </Box>
    </Card>
  );
};

export const AccountSecurityPanel = () => {
  const { data: status, isLoading, error } = useGetMfaStatusQuery();
  const [freshRecoveryCodes, setFreshRecoveryCodes] = useState<string[] | null>(
    null,
  );

  if (isLoading || error != null || status == null) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
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
