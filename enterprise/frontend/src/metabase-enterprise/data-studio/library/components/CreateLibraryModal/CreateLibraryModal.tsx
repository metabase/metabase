import { t } from "ttag";

import { trackDataStudioLibraryCreated } from "metabase/data-studio/analytics";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
} from "metabase/forms";
import { useMetadataToasts } from "metabase/metadata/hooks";
import type { CreateLibraryModalProps } from "metabase/plugins";
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

export function CreateLibraryModal({
  title = t`Create your Library`,
  explanatorySentence,
  isOpened,
  onCreate,
  onClose,
}: CreateLibraryModalProps) {
  return (
    <Modal
      title={<ModalTitle title={title} />}
      opened={isOpened}
      onClose={onClose}
    >
      <FocusTrap.InitialFocus />
      <ModalBody
        explanatorySentence={explanatorySentence}
        onCreate={onCreate}
        onClose={onClose}
      />
    </Modal>
  );
}

type ModalTitleProps = {
  title: string;
};

function ModalTitle({ title }: ModalTitleProps) {
  return (
    <Group gap="sm">
      <Center w="2rem" h="2rem" c="brand" bg="background-brand" bdrs="md">
        <FixedSizeIcon name="repository" />
      </Center>
      <Title order={3}>{title}</Title>
    </Group>
  );
}

type ModalBodyProps = {
  explanatorySentence?: string;
  onCreate?: (collection: Collection) => void;
  onClose: () => void;
};

function ModalBody({ explanatorySentence, onCreate, onClose }: ModalBodyProps) {
  const [createLibrary] = useCreateLibraryMutation();
  const { sendSuccessToast } = useMetadataToasts();

  const handleSubmit = async () => {
    const collection = await createLibrary().unwrap();
    sendSuccessToast(t`Library created`);
    trackDataStudioLibraryCreated(collection.id);
    onCreate?.(collection);
  };

  return (
    <FormProvider initialValues={{}} onSubmit={handleSubmit}>
      <Form>
        <FocusTrap.InitialFocus />
        <Stack gap="sm">
          {explanatorySentence && <Text>{explanatorySentence}</Text>}
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
              description={t`Sync your Library to Git`}
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
          <FormSubmitButton label={t`Create my Library`} variant="filled" />
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
