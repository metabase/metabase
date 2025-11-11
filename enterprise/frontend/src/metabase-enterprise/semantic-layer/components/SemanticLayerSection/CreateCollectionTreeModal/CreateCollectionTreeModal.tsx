import { t } from "ttag";

import { Form, FormErrorMessage, FormProvider } from "metabase/forms";
import { Box, Button, FocusTrap, Group, List, Modal, Text } from "metabase/ui";
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
          <Text>
            {t`The Semantic Layer helps you create a source of truth for analytics by providing a centrally managed set of curated content. It separates authoritative, reusable components from ad-hoc analyses.`}
          </Text>
          <List mt="sm" spacing="sm">
            <ListItem
              title={t`Models`}
              description={t`Cleaned, pre-transformed data sources ready for exploring`}
            />
            <ListItem
              title={t`Metrics`}
              description={t`Standardized calculations with known dimensions`}
            />
            <ListItem
              title={t`Version control`}
              description={t`Sync your library to Git for governance`}
            />
            <ListItem
              title={t`High trust`}
              description={t`Default to reliable sources your data team prescribes`}
            />
          </List>
          <Group mt="xl">
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

type ListItemProps = {
  title: string;
  description: string;
};

function ListItem({ title, description }: ListItemProps) {
  return (
    <List.Item>
      <strong>{title}</strong>
      {": "}
      {description}
    </List.Item>
  );
}
