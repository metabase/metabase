import { t } from "ttag";

import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
} from "metabase/forms";
import { Box, Button, Group, Modal, Stack, Text } from "metabase/ui";
import type { DatabaseId, SchemaId, TableId } from "metabase-types/api";

interface Props {
  tables?: Set<TableId>;
  schemas?: Set<SchemaId>;
  databases?: Set<DatabaseId>;
  isOpen: boolean;
  onClose: () => void;
}

export function UnpublishTablesModal({ isOpen, onClose }: Props) {
  const handleSubmit = () => {};

  return (
    <Modal
      title={t`Un-publish this table?`}
      opened={isOpen}
      padding="xl"
      onClose={onClose}
    >
      <FormProvider initialValues={{}} onSubmit={handleSubmit}>
        <Form>
          <Stack>
            <Text>
              {t`Publishing a table means placing it in a collection in the Library so that it’s easy for your end users to find and use it in their explorations.`}
            </Text>
          </Stack>
          <Group wrap="nowrap">
            <Box flex={1}>
              <FormErrorMessage />
            </Box>
            <Button variant="subtle">{t`Cancel`}</Button>
            <FormSubmitButton color="error" label={t`Un-publish`} />
          </Group>
        </Form>
      </FormProvider>
    </Modal>
  );
}
