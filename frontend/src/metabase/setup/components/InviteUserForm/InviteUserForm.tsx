import React, { useCallback, useMemo } from "react";
import { t } from "ttag";
import * as Yup from "yup";
import Form from "metabase/core/components/Form";
import FormProvider from "metabase/core/components/FormProvider";
import FormInput from "metabase/core/components/FormInput";
import FormSubmitButton from "metabase/core/components/FormSubmitButton";
import { InviteInfo, UserInfo } from "metabase-types/store";
import { UserFieldGroup } from "./InviteUserForm.styled";

const InviteUserSchema = Yup.object({
  first_name: Yup.string().max(
    100,
    ({ max }) => t`must be ${max} characters or less`,
  ),
  last_name: Yup.string().max(
    100,
    ({ max }) => t`must be ${max} characters or less`,
  ),
  email: Yup.string()
    .required(t`required`)
    .email(t`must be a valid email address`)
    .notOneOf(
      [Yup.ref("$email")],
      t`must be different from the email address you used in setup`,
    ),
});

interface InviteUserFormProps {
  user?: UserInfo;
  invite?: InviteInfo;
  onSubmit: (invite: InviteInfo) => void;
}

const InviteUserForm = ({
  user,
  invite,
  onSubmit,
}: InviteUserFormProps): JSX.Element => {
  const initialValues = useMemo(() => {
    return getInitialValues(invite);
  }, [invite]);

  const handleSubmit = useCallback(
    (values: InviteInfo) => onSubmit(getSubmitValues(values)),
    [onSubmit],
  );

  return (
    <FormProvider
      initialValues={initialValues}
      validationSchema={InviteUserSchema}
      validationContext={user}
      onSubmit={handleSubmit}
    >
      <Form>
        <UserFieldGroup>
          <FormInput
            name="first_name"
            title={t`First name`}
            placeholder={t`Johnny`}
            autoFocus
            fullWidth
          />
          <FormInput
            name="last_name"
            title={t`Last name`}
            placeholder={t`Appleseed`}
            fullWidth
          />
        </UserFieldGroup>
        <FormInput
          name="email"
          title={t`Email`}
          placeholder={"nicetoseeyou@email.com"}
          fullWidth
        />
        <FormSubmitButton title={`Send invitation`} primary />
      </Form>
    </FormProvider>
  );
};

const getInitialValues = (invite?: InviteInfo): InviteInfo => {
  return {
    email: "",
    ...invite,
    first_name: invite?.first_name || "",
    last_name: invite?.last_name || "",
  };
};

const getSubmitValues = (invite: InviteInfo): InviteInfo => {
  return {
    ...invite,
    first_name: invite.first_name || null,
    last_name: invite.last_name || null,
  };
};

export default InviteUserForm;
