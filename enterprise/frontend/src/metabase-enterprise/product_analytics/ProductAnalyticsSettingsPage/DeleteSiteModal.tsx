import { useCallback } from "react";
import { t } from "ttag";

import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
} from "metabase/forms";
import { Button, Group, Modal, Stack, Text } from "metabase/ui";
import type { ProductAnalyticsSite } from "metabase-enterprise/api/product-analytics";
import { useDeleteProductAnalyticsSiteMutation } from "metabase-enterprise/api/product-analytics";

export function DeleteSiteModal({
  site,
  onClose,
}: {
  site: ProductAnalyticsSite;
  onClose: () => void;
}) {
  const [deleteProductAnalyticsSite] = useDeleteProductAnalyticsSiteMutation();

  const handleDelete = useCallback(async () => {
    await deleteProductAnalyticsSite(site.id);
    onClose();
  }, [deleteProductAnalyticsSite, site.id, onClose]);

  return (
    <Modal size="30rem" opened onClose={onClose} title={t`Remove origin`}>
      <FormProvider initialValues={{}} onSubmit={handleDelete}>
        <Form>
          <Stack gap="lg">
            <Text>{t`Are you sure you want to remove ${site.name}? This will disable analytics tracking for all its allowed domains.`}</Text>
            <FormErrorMessage />
            <Group justify="flex-end">
              <Button onClick={onClose}>{t`Cancel`}</Button>
              <FormSubmitButton
                label={t`Remove origin`}
                variant="filled"
                color="error"
              />
            </Group>
          </Stack>
        </Form>
      </FormProvider>
    </Modal>
  );
}
