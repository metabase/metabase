import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";
import * as Yup from "yup";

import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import * as Errors from "metabase/lib/errors";
import { Anchor, Text } from "metabase/ui";

import type { MfaVerifyData } from "../../types";

const TOTP_SCHEMA = Yup.object().shape({
  "totp-code": Yup.string()
    .required(Errors.required)
    .matches(/^\d{6}$/, Errors.required),
});

const RECOVERY_SCHEMA = Yup.object().shape({
  "recovery-code": Yup.string().required(Errors.required),
});

interface MfaFormProps {
  mfaToken: string;
  onSubmit: (data: MfaVerifyData) => void;
}

export const MfaForm = ({ mfaToken, onSubmit }: MfaFormProps): JSX.Element => {
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);

  const initialValues = useMemo(
    (): Record<string, string> =>
      useRecoveryCode ? { "recovery-code": "" } : { "totp-code": "" },
    [useRecoveryCode],
  );

  const handleSubmit = useCallback(
    (values: Record<string, string>) => {
      onSubmit({
        "mfa-token": mfaToken,
        ...values,
      } as MfaVerifyData);
    },
    [mfaToken, onSubmit],
  );

  return (
    <div>
      <Text fw="bold" fz="xl" mb="1rem">
        {t`Two-factor authentication`}
      </Text>
      <Text c="text-secondary" mb="1.5rem">
        {useRecoveryCode
          ? t`Enter one of your recovery codes to sign in.`
          : t`Enter the 6-digit code from your authenticator app.`}
      </Text>
      <FormProvider
        key={useRecoveryCode ? "recovery" : "totp"}
        initialValues={initialValues}
        validationSchema={useRecoveryCode ? RECOVERY_SCHEMA : TOTP_SCHEMA}
        onSubmit={handleSubmit}
      >
        <Form>
          {useRecoveryCode ? (
            <FormTextInput
              name="recovery-code"
              label={t`Recovery code`}
              placeholder="abcd1234"
              autoFocus
              mb="1.25rem"
            />
          ) : (
            <FormTextInput
              name="totp-code"
              label={t`Verification code`}
              placeholder="000000"
              inputMode="numeric"
              maxLength={6}
              autoFocus
              mb="1.25rem"
            />
          )}
          <FormSubmitButton label={t`Verify`} variant="filled" w="100%" />
          <FormErrorMessage mt="1rem" />
        </Form>
      </FormProvider>
      <Text ta="center" mt="1rem">
        <Anchor
          component="button"
          type="button"
          onClick={() => setUseRecoveryCode(!useRecoveryCode)}
        >
          {useRecoveryCode
            ? t`Use authenticator app instead`
            : t`Use a recovery code`}
        </Anchor>
      </Text>
    </div>
  );
};
