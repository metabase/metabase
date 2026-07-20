import { useMemo } from "react";
import { t } from "ttag";
import * as Yup from "yup";

import {
  Form,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import type { InviteInfo, UserInfo } from "metabase/redux/store";
import { Stack } from "metabase/ui";
import * as Errors from "metabase/utils/errors";

import S from "./InviteUserForm.module.css";

const INVITE_USER_SCHEMA = Yup.object({
  first_name: Yup.string().nullable().default(null).max(100, Errors.maxLength),
  last_name: Yup.string().nullable().default(null).max(100, Errors.maxLength),
  email: Yup.string()
    .default("")
    .required(Errors.required)
    .email(Errors.email)
    .notOneOf(
      [Yup.ref("$email")],
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
      <Form as={Stack} gap="md" data-testid="invite-user-form">
        <div className={S.UserFieldGroup}>
          <FormTextInput
            name="first_name"
            label={t`First name`}
            placeholder={t`Johnny`}
            nullable
            autoFocus
          />
          <FormTextInput
            name="last_name"
            label={t`Last name`}
            placeholder={t`Appleseed`}
            nullable
          />
        </div>
        <FormTextInput
          name="email"
          label={t`Email`}
          placeholder={"nicetoseeyou@email.com"}
        />
        <FormSubmitButton label={t`Send invitation`} variant="filled" />
      </Form>
    </FormProvider>
  );
};
