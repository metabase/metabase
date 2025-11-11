import { t } from "ttag";

import { Form, FormErrorMessage, FormProvider } from "metabase/forms";
import { Box, Button, Group, Modal } from "metabase/ui";

type CreateSemanticLayerModalProps = {
  onClose: () => void;
};

export function CreateSemanticLayerModal({
  onClose,
}: CreateSemanticLayerModalProps) {
  const handleSubmit = () => {};

  return (
    <Modal title={t`Create your Semantic Layer`} opened onClose={onClose}>
      <FormProvider initialValues={{}} onSubmit={handleSubmit}>
        <Form>
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
