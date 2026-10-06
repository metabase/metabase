import { useCallback, useMemo } from "react";
import { t } from "ttag";
import * as Yup from "yup";

import { Link } from "metabase/common/components/Link";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import { useSelector } from "metabase/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { Box, Flex, Stack } from "metabase/ui";
import * as Errors from "metabase/utils/errors";

import type { ForgotPasswordData } from "../../types";

import S from "./ForgotPasswordForm.module.css";

const FORGOT_PASSWORD_SCHEMA = Yup.object({
  email: Yup.string().required(Errors.required).email(Errors.email),
});

interface ForgotPasswordFormProps {
  initialEmail?: string;
  onSubmit: (email: string) => void;
}

export const ForgotPasswordForm = ({
  initialEmail = "",
  onSubmit,
}: ForgotPasswordFormProps): JSX.Element => {
  const initialValues = useMemo(
    () => ({ email: initialEmail }),
    [initialEmail],
  );

  const handleSubmit = useCallback(
    ({ email }: ForgotPasswordData) => onSubmit(email),
    [onSubmit],
  );

  const applicationName = useSelector(getApplicationName);

  return (
    <div>
      <Box
        c="text-primary"
        fz="xl"
        fw={700}
        lh="1.5rem"
        ta="center"
        mb="xl"
      >{t`Forgot password`}</Box>
      <FormProvider
        initialValues={initialValues}
        validationSchema={FORGOT_PASSWORD_SCHEMA}
        onSubmit={handleSubmit}
      >
        <Form as={Stack} gap="lg">
          <FormTextInput
            name="email"
            label={t`Email address`}
            placeholder={t`The email you use for your ${applicationName} account`}
            autoFocus
          />
          <FormSubmitButton
            label={t`Send password reset email`}
            variant="filled"
            fullWidth
          />
          <FormErrorMessage />
        </Form>
      </FormProvider>
      <Flex direction="column" align="center" mt="xl">
        <Link
          className={S.passwordFormLink}
          to="/auth/login"
        >{t`Back to sign in`}</Link>
      </Flex>
    </div>
  );
};
