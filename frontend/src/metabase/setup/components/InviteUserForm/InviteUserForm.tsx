import { useMemo } from "react";
import { t } from "ttag";
import { object, ref, string } from "yup";

import FormInput from "metabase/core/components/FormInput";
import FormSubmitButton from "metabase/core/components/FormSubmitButton";
import { Form, FormProvider } from "metabase/forms";
import * as Errors from "metabase/lib/errors";
import type { InviteInfo, UserInfo } from "metabase-types/store";

import { UserFieldGroup } from "./InviteUserForm.styled";

const INVITE_USER_SCHEMA = object({
  first_name: string().nullable().default(null).max(100, Errors.maxLength),
  last_name: string().nullable().default(null).max(100, Errors.maxLength),
  email: string()
    .default("")
    .required(Errors.required)
    .email(Errors.email)
    .notOneOf(
      [ref("$email")],
      // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
      t`must be different from the email address you used in setup`,
    ),
});

interface InviteUserFormProps {
  user?: UserInfo;
  invite?: InviteInfo;
  onSubmit: (invite: InviteInfo) => void;
}

export const InviteUserForm = ({
  user,
  invite,
  onSubmit,
}: InviteUserFormProps): JSX.Element => {
  const initialValues = useMemo(() => {
    return invite ?? INVITE_USER_SCHEMA.getDefault();
  }, [invite]);

  return (
    <FormProvider
      initialValues={initialValues}
      validationSchema={INVITE_USER_SCHEMA}
      validationContext={user}
      onSubmit={onSubmit}
    >
      <Form>
        <UserFieldGroup>
          <FormInput
            name="first_name"
            title={t`First name`}
            placeholder={t`Johnny`}
            nullable
            autoFocus
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
          title={t`Email`}
          placeholder={"nicetoseeyou@email.com"}
        />
        <FormSubmitButton title={t`Send invitation`} primary />
      </Form>
    </FormProvider>
  );
};
