import { useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";
import * as Yup from "yup";

import { useValidatePassword } from "metabase/common/hooks";
import {
  Form,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import type { UserInfo } from "metabase/redux/store";
import { Flex, Stack } from "metabase/ui";
import * as Errors from "metabase/utils/errors";

import { UserFieldGroup } from "./UserForm.styled";

const USER_SCHEMA = Yup.object({
  first_name: Yup.string().nullable().default(null).max(100, Errors.maxLength),
  last_name: Yup.string().nullable().default(null).max(100, Errors.maxLength),
  email: Yup.string().default("").required(Errors.required).email(Errors.email),
  site_name: Yup.string().default("").required(Errors.required),
  password: Yup.string()
    .default("")
    .required(Errors.required)
    .test(async (value = "", context) => {
      const error = await context.options.context?.onValidatePassword(value);
      return error ? context.createError({ message: error }) : true;
    }),
  password_confirm: Yup.string()
    .default("")
    .required(Errors.required)
    // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
    .oneOf([Yup.ref("password")], t`passwords do not match`),
});

interface UserFormProps {
  user?: UserInfo;
  isHosted: boolean;
  onSubmit: (user: UserInfo) => Promise<void>;
}

export const UserForm = ({ user, isHosted, onSubmit }: UserFormProps) => {
  const validatePassword = useValidatePassword();
  const validationContext = useMemo(
    () => ({ onValidatePassword: _.memoize(validatePassword) }),
    [validatePassword],
  );
  const initialValues = useMemo(() => {
    return user ?? USER_SCHEMA.getDefault();
  }, [user]);

  return (
    <FormProvider
      initialValues={initialValues}
      validationSchema={USER_SCHEMA}
      validationContext={validationContext}
      onSubmit={onSubmit}
    >
      <Form as={Stack} gap="md" mt="md">
        <UserFieldGroup>
          <FormTextInput
            name="first_name"
            label={t`First name`}
            placeholder={t`Johnny`}
            nullable
            autoFocus={!isHosted}
          />
          <FormTextInput
            name="last_name"
            label={t`Last name`}
            placeholder={t`Appleseed`}
            nullable
          />
        </UserFieldGroup>
        <FormTextInput
          name="email"
          type="email"
          label={t`Email`}
          placeholder="nicetoseeyou@email.com"
        />
        <FormTextInput
          name="site_name"
          label={t`Company or team name`}
          placeholder={t`Department of Awesome`}
        />
        <FormTextInput
          name="password"
          type="password"
          label={t`Create a password`}
          placeholder={t`Shhh...`}
          // Hosted instances always pass user information in the URLSearchParams
          // during the initial setup. Password is the first empty field
          // so it makes sense to focus on it.
          autoFocus={isHosted && initialValues.site_name !== ""}
        />
        <FormTextInput
          name="password_confirm"
          type="password"
          label={t`Confirm your password`}
          placeholder={t`Shhh... but one more time so we get it right`}
        />
        <Flex align="center">
          <FormSubmitButton
            label={t`Next`}
            activeLabel={t`Saving`}
            variant="filled"
          />
        </Flex>
      </Form>
    </FormProvider>
  );
};
