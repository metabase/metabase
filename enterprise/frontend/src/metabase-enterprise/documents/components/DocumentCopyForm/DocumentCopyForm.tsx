import { t } from "ttag";

import {
  Form,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import { Button, Stack } from "metabase/ui";
import FormCollectionPicker from "metabase/collections/containers/FormCollectionPicker";
import { FormFooter } from "metabase/common/components/FormFooter";

export const DocumentCopyForm = ({
  initialValues,
  onCancel,
  onSubmit,
  onSaved,
}) => {
  return (
    <FormProvider
      initialValues={initialValues}
      onSubmit={onSubmit}
      enableReinitialize
    >
      {({ dirty }) => (
        <Form>
          <Stack gap="md" mb="md">
            <FormTextInput
              name="name"
              label={t`Name`}
              placeholder={t`What is the name of your dashboard?`}
              autoFocus
            />
            <div>
              <FormCollectionPicker
                name="collection_id"
                title={t`Folder this document should be copied to`}
              />
            </div>
          </Stack>
          <FormFooter>
            {!!onCancel && (
              <Button type="button" onClick={onCancel}>{t`Cancel`}</Button>
            )}
            <FormSubmitButton label={t`Copy`} variant="primary" />
          </FormFooter>
        </Form>
      )}
    </FormProvider>
  );
};
