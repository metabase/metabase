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
import { trackDataStudioLibraryCreated } from "metabase-enterprise/data-studio/analytics";
import type { Collection } from "metabase-types/api";

type CreateLibraryModalProps = {
  isOpened: boolean;
  withPublishInfo?: boolean;
  onCreate: (collection: Collection) => void;
  onClose: () => void;
};

export function CreateLibraryModal({
  isOpened,
  withPublishInfo,
  onCreate,
  onClose,
}: CreateLibraryModalProps) {
  return (
    <Modal title={<ModalTitle />} opened={isOpened} onClose={onClose}>
      <ModalBody
        withPublishInfo={withPublishInfo}
        onCreate={onCreate}
        onClose={onClose}
      />
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
  withPublishInfo?: boolean;
  onCreate: (collection: Collection) => void;
  onClose: () => void;
};

function ModalBody({ withPublishInfo, onCreate, onClose }: ModalBodyProps) {
  const [createLibrary] = useCreateLibraryMutation();

  const handleSubmit = async () => {
    const collection = await createLibrary().unwrap();
    trackDataStudioLibraryCreated(collection.id);
    onCreate(collection);
  };

  return (
    <FormProvider initialValues={{}} onSubmit={handleSubmit}>
      <Form>
        <FocusTrap.InitialFocus />
        <Stack gap="sm">
          {withPublishInfo && (
            <Text>
              {t`Publishing a table means placing it in a collection in the Library so that it’s easy for your end users to find and use it in their explorations.`}
            </Text>
          )}
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
            {withPublishInfo
              ? t`Create my Library and publish`
              : t`Create my Library`}
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
