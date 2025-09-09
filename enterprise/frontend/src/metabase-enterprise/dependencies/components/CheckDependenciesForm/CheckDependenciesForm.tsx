import { t } from "ttag";

import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
} from "metabase/forms";
import type { CheckDependenciesFormProps } from "metabase/plugins";
import { Box, Button, Group } from "metabase/ui";

export function CheckDependenciesForm({
  onSave,
  onCancel,
}: CheckDependenciesFormProps) {
  return (
    <FormProvider initialValues={{}} onSubmit={onSave}>
      <Form>
        <Group>
          <Box flex={1}>
            <FormErrorMessage />
          </Box>
          <Button onClick={onCancel}>{t`Cancel`}</Button>
          <FormSubmitButton label={t`Save anyway`} variant="filled" />
        </Group>
      </Form>
    </FormProvider>
  );
}
