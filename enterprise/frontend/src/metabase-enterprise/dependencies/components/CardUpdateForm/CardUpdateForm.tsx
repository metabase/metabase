import { t } from "ttag";

import { Form, FormProvider, FormSubmitButton } from "metabase/forms";
import type { CardUpdateFormProps } from "metabase/plugins";
import { Button, Group } from "metabase/ui";

export function CardUpdateForm({ onSave, onCancel }: CardUpdateFormProps) {
  return (
    <FormProvider initialValues={{}} onSubmit={onSave}>
      <Form>
        <Group justify="end">
          <Button onClick={onCancel}>{t`Cancel`}</Button>
          <FormSubmitButton label={t`Save anyway`} variant="filled" />
        </Group>
      </Form>
    </FormProvider>
  );
}
