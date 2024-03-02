import { useCallback, useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";
import * as Yup from "yup";

import {
  Form,
  FormProvider,
  FormTextInput,
  FormSubmitButton,
  FormErrorMessage,
  requiredErrorMessage,
} from "metabase/forms";
import { Group, Stack } from "metabase/ui";
import type { User } from "metabase-types/api";

import type { UserPasswordData } from "../../types";

const USER_PASSWORD_SCHEMA = Yup.object({
  old_password: Yup.string().default("").required(requiredErrorMessage),
  password: Yup.string()
    .default("")
    .required(requiredErrorMessage)
    .test(async (value = "", context) => {
      const error = await context.options.context?.onValidatePassword(value);
      return error ? context.createError({ message: error }) : true;
    }),
  password_confirm: Yup.string()
    .default("")
    .required(requiredErrorMessage)
    .oneOf([Yup.ref("password")], t`Passwords do not match`),
});

export interface UserPasswordFormProps {
  user: User;
  onValidatePassword: (password: string) => Promise<string | undefined>;
  onSubmit: (user: User, data: UserPasswordData) => void;
}

export const UserPasswordForm = ({
  user,
  onValidatePassword,
  onSubmit,
}: UserPasswordFormProps): JSX.Element => {
  const initialValues = useMemo(() => {
    return USER_PASSWORD_SCHEMA.getDefault();
  }, []);

  const validationContext = useMemo(
    () => ({ onValidatePassword: _.memoize(onValidatePassword) }),
    [onValidatePassword],
  );

  const handleSubmit = useCallback(
    (data: UserPasswordData) => {
      return onSubmit(user, data);
    },
    [user, onSubmit],
  );

  return (
    <FormProvider
      initialValues={initialValues}
      validationSchema={USER_PASSWORD_SCHEMA}
      validationContext={validationContext}
      onSubmit={handleSubmit}
    >
      <Form>
        <Stack>
          <FormTextInput
            name="old_password"
            type="password"
            label={t`Current password`}
            placeholder={t`Shhh...`}
            autoComplete="current-password"
          />
          <FormTextInput
            name="password"
            type="password"
            label={t`Create a password`}
            placeholder={t`Shhh...`}
            autoComplete="new-password"
          />
          <FormTextInput
            name="password_confirm"
            type="password"
            label={t`Confirm your password`}
            placeholder={t`Shhh... but one more time so we get it right`}
            autoComplete="new-password"
          />
          <Group>
            <FormSubmitButton label={t`Save`} variant="filled" />
          </Group>
          <FormErrorMessage />
        </Stack>
      </Form>
    </FormProvider>
  );
};
