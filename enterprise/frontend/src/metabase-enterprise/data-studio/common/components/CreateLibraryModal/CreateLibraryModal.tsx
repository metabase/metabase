import { t } from "ttag";

import { Form, FormErrorMessage, FormProvider } from "metabase/forms";
import {
  Box,
  Button,
  Center,
  FixedSizeIcon,
  FocusTrap,
  Group,
  List,
  Modal,
  Stack,
  Text,
  Title,
} from "metabase/ui";
import { useCreateLibraryMutation } from "metabase-enterprise/api";
import type { Collection } from "metabase-types/api";

type CreateLibraryModalProps = {
  isOpened: boolean;
  onCreate: (collection: Collection) => void;
  onClose: () => void;
};

export function CreateLibraryModal({
  isOpened,
  onCreate,
  onClose,
}: CreateLibraryModalProps) {
  return (
    <Modal title={<ModalTitle />} opened={isOpened} onClose={onClose}>
      <ModalBody onCreate={onCreate} onClose={onClose} />
    </Modal>
  );
}

function ModalTitle() {
  return (
    <Group gap="sm">
      <Center w="2rem" h="2rem" c="brand" bg="brand-light" bdrs="md">
        <FixedSizeIcon name="repository" />
      </Center>
      <Title order={3}>{t`Create your Library`}</Title>
    </Group>
  );
}

type ModalBodyProps = {
  onCreate: (collection: Collection) => void;
  onClose: () => void;
};

function ModalBody({ onCreate, onClose }: ModalBodyProps) {
  const [createLibrary] = useCreateLibraryMutation();

  const handleSubmit = async () => {
    const collection = await createLibrary().unwrap();
    onCreate(collection);
  };

  return (
    <FormProvider initialValues={{}} onSubmit={handleSubmit}>
      <Form>
        <FocusTrap.InitialFocus />
        <Stack gap="sm">
          <Text>
            {t`The Library helps you create a source of truth for analytics by providing a centrally managed set of curated content. It separates authoritative, reusable components from ad-hoc analyses.`}
          </Text>
          <List spacing="sm">
            <ListItem
              title={t`Tables`}
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
        </Stack>
        <Group mt="xl" gap="sm">
          <Box flex={1}>
            <FormErrorMessage />
          </Box>
          <Button variant="subtle" onClick={onClose}>{t`Cancel`}</Button>
          <Button variant="filled" type="submit">
            {t`Create my Library`}
          </Button>
        </Group>
      </Form>
    </FormProvider>
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
