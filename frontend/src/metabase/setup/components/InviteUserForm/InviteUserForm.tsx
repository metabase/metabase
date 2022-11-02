import React, { useCallback, useMemo } from "react";
import { t } from "ttag";
import * as Yup from "yup";
import Form from "metabase/core/components/Form";
import FormInput from "metabase/core/components/FormInput";
import FormProvider from "metabase/core/components/FormProvider";
import { InviteInfo, UserInfo } from "metabase-types/store";
import { UserFieldGroup } from "./InviteUserForm.styled";

const InviteUserSchema = Yup.object().shape({
  first_name: Yup.string().max(100, t`must be 100 characters or less`),
  last_name: Yup.string().max(100, t`must be 100 characters or less`),
  email: Yup.string()
    .required(t`required`)
    .email(t`must be a valid email address`),
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
    (values: InviteInfo) => {
      onSubmit(getSubmitValues(values));
    },
    [onSubmit],
  );

  return (
    <FormProvider
      initialValues={initialValues}
      validationSchema={InviteUserSchema}
      onSubmit={handleSubmit}
    >
      <Form>
        <UserFieldGroup>
          <FormInput name="first_name" />
          <FormInput name="last_name" />
        </UserFieldGroup>
        <FormInput name="email" />
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
