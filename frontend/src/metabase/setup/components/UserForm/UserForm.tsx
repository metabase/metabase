import { useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";
import * as Yup from "yup";

import { FormInput } from "metabase/common/components/FormInput";
import { FormSubmitButton } from "metabase/common/components/FormSubmitButton";
import { Form, FormProvider, useFormSubmitButton } from "metabase/forms";
import * as Errors from "metabase/lib/errors";
import { validatePassword } from "metabase/setup/utils";
import { Flex } from "metabase/ui";
import type { UserInfo } from "metabase-types/store";

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

const validationContext = {
  onValidatePassword: _.memoize(validatePassword),
};

export const UserForm = ({ user, isHosted, onSubmit }: UserFormProps) => {
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
      <Form mt="md">
        <UserFieldGroup>
          <FormInput
            name="first_name"
            title={t`First name`}
            placeholder={t`Johnny`}
            nullable
            autoFocus={!isHosted}
          />
          <FormInput
            name="last_name"
            title={t`Last name`}
            placeholder={t`Appleseed`}
            nullable
          />
        </UserFieldGroup>
        <FormInput
          name="email"
          type="email"
          title={t`Email`}
          placeholder="nicetoseeyou@email.com"
        />
        <FormInput
          name="site_name"
          title={t`Company or team name`}
          placeholder={t`Department of Awesome`}
        />
        <FormInput
          name="password"
          type="password"
          title={t`Create a password`}
          placeholder={t`Shhh...`}
          // Hosted instances always pass user information in the URLSearchParams
          // during the initial setup. Password is the first empty field
          // so it makes sense to focus on it.
          autoFocus={isHosted && initialValues.site_name !== ""}
        />
        <FormInput
          name="password_confirm"
          type="password"
          title={t`Confirm your password`}
          placeholder={t`Shhh... but one more time so we get it right`}
        />
        <UserFormSubmitButton />
      </Form>
    </FormProvider>
  );
};

const UserFormSubmitButton = () => {
  const { status } = useFormSubmitButton({ isDisabled: false });

  return (
    <Flex align="center">
      <FormSubmitButton
        title={t`Next`}
        activeTitle={t`Saving`}
        primary={status === "idle"}
      />
    </Flex>
  );
};
