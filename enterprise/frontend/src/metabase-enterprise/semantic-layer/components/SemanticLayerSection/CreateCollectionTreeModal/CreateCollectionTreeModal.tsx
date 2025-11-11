import { t } from "ttag";

import { Form, FormErrorMessage, FormProvider } from "metabase/forms";
import { Box, Button, FocusTrap, Group, Modal } from "metabase/ui";
import { useCreateSemanticLayerCollectionMutation } from "metabase-enterprise/api";
import type { Collection } from "metabase-types/api";

type CreateCollectionTreeModalProps = {
  onCreate: (collection: Collection) => void;
  onClose: () => void;
};

export function CreateCollectionTreeModal({
  onClose,
}: CreateCollectionTreeModalProps) {
  const [createCollection] = useCreateSemanticLayerCollectionMutation();

  const handleSubmit = async () => {
    await createCollection().unwrap();
  };

  return (
    <Modal title={t`Create your Semantic Layer`} opened onClose={onClose}>
      <FormProvider initialValues={{}} onSubmit={handleSubmit}>
        <Form>
          <FocusTrap.InitialFocus />
          <Group>
            <Box flex={1}>
              <FormErrorMessage />
            </Box>
            <Button variant="subtle" onClick={onClose}>{t`Cancel`}</Button>
            <Button variant="filled" type="submit">
              {t`Create my Semantic Layer`}
            </Button>
          </Group>
        </Form>
      </FormProvider>
    </Modal>
  );
}
