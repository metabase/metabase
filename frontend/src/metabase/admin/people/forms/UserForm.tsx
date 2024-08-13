import { t } from "ttag";
import * as Yup from "yup";

import FormFooter from "metabase/core/components/FormFooter";
import {
  FormTextInput,
  Form,
  FormProvider,
  FormSubmitButton,
  FormErrorMessage,
  FormGroupsWidget,
} from "metabase/forms";
import * as Errors from "metabase/lib/errors";
import { PLUGIN_ADMIN_USER_FORM_FIELDS } from "metabase/plugins";
import { Button } from "metabase/ui";
import type { User } from "metabase-types/api";

const localUserSchema = Yup.object({
  first_name: Yup.string().nullable().max(100, Errors.maxLength).default(null),
  last_name: Yup.string().nullable().max(100, Errors.maxLength).default(null),
  email: Yup.string().email().required(Errors.required),
});

interface UserFormProps {
  initialValues?: Partial<User>;
  onSubmit: (val: Partial<User>) => void;
  onCancel: () => void;
  submitText?: string;
}

export const UserForm = ({
  initialValues = {},
  onSubmit,
  onCancel,
  submitText = t`Update`,
}: UserFormProps) => {
  return (
    <FormProvider
      initialValues={initialValues}
      validationSchema={localUserSchema}
      enableReinitialize
      onSubmit={onSubmit}
    >
      {({ dirty }: { dirty: boolean }) => (
        <Form disabled={!dirty}>
          <FormTextInput
            name="first_name"
            title={t`First name`}
            placeholder={t`Johnny`}
            label={t`First name`}
            mb="1rem"
          />
          <FormTextInput
            name="last_name"
            title={t`Last name`}
            placeholder={t`Appleseed`}
            label={t`Last name`}
            mb="1rem"
          />
          <FormTextInput
            name="email"
            type="email"
            title={t`Email`}
            placeholder="nicetoseeyou@email.com"
            label={t`Email`}
            required
            mb="1rem"
          />
          <FormGroupsWidget name="user_group_memberships" />
          <PLUGIN_ADMIN_USER_FORM_FIELDS.FormLoginAttributes />
          <FormFooter>
            <FormErrorMessage inline />
            <Button type="button" onClick={onCancel}>{t`Cancel`}</Button>
            <FormSubmitButton
              label={submitText}
              disabled={!dirty}
              variant="filled"
            />
          </FormFooter>
        </Form>
      )}
    </FormProvider>
  );
};
