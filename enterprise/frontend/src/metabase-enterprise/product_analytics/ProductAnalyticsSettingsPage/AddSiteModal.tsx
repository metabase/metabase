import { useCallback } from "react";
import { t } from "ttag";

import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
  FormTextarea,
} from "metabase/forms";
import { Button, Group, Modal, Stack } from "metabase/ui";
import { useCreateProductAnalyticsSiteMutation } from "metabase-enterprise/api/product-analytics";

type AddSiteFormValues = {
  name: string;
  allowed_domains: string;
};

export function AddSiteModal({ onClose }: { onClose: () => void }) {
  const [createProductAnalyticsSite] = useCreateProductAnalyticsSiteMutation();

  const handleSubmit = useCallback(
    async ({ name, allowed_domains }: AddSiteFormValues) => {
      await createProductAnalyticsSite({ name, allowed_domains }).unwrap();
      onClose();
    },
    [createProductAnalyticsSite, onClose],
  );

  return (
    <Modal size="30rem" opened onClose={onClose} title={t`Add site`}>
      <FormProvider
        initialValues={{ name: "", allowed_domains: "" }}
        onSubmit={handleSubmit}
      >
        <Form>
          <Stack gap="md">
            <FormTextInput name="name" label={t`Name`} size="sm" required />
            <FormTextarea
              name="allowed_domains"
              label={t`Allowed domains`}
              description={t`Separate multiple domains with a space or new line.`}
              placeholder="https://example.com, https://*.example.com"
              size="sm"
              required
            />
            <FormErrorMessage />
            <Group justify="flex-end">
              <Button onClick={onClose}>{t`Cancel`}</Button>
              <FormSubmitButton variant="filled" label={t`Add site`} />
            </Group>
          </Stack>
        </Form>
      </FormProvider>
    </Modal>
  );
}
