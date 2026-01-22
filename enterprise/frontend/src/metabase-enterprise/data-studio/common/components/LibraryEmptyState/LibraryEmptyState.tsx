import { t } from "ttag";

import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
} from "metabase/forms";
import { useMetadataToasts } from "metabase/metadata/hooks";
import {
  Box,
  Center,
  FixedSizeIcon,
  Group,
  List,
  Stack,
  Text,
  Title,
} from "metabase/ui";
import { useCreateLibraryMutation } from "metabase-enterprise/api";
import { trackDataStudioLibraryCreated } from "metabase-enterprise/data-studio/analytics";

export function LibraryEmptyState() {
  const [createLibrary] = useCreateLibraryMutation();
  const { sendSuccessToast } = useMetadataToasts();

  const handleSubmit = async () => {
    const collection = await createLibrary().unwrap();
    sendSuccessToast(t`Library created`);
    trackDataStudioLibraryCreated(collection.id);
  };

  return (
    <FormProvider initialValues={{}} onSubmit={handleSubmit}>
      <Form>
        <Center h="100%">
          <Stack gap="lg" maw={480}>
            <Group gap="sm">
              <Center w="2rem" h="2rem" c="brand" bg="brand-light" bdrs="md">
                <FixedSizeIcon name="repository" />
              </Center>
              <Title order={3}>{t`Create your Library`}</Title>
            </Group>
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
                  description={t`Sync your Library to Git`}
                />
                <ListItem
                  title={t`High trust`}
                  description={t`Default to reliable sources your data team prescribes`}
                />
              </List>
            </Stack>
            <Group gap="sm">
              <Box flex={1}>
                <FormErrorMessage />
              </Box>
              <FormSubmitButton label={t`Create my Library`} variant="filled" />
            </Group>
          </Stack>
        </Center>
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
