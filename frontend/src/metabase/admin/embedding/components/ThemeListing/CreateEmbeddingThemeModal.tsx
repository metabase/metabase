import { t } from "ttag";
import * as Yup from "yup";

import { useCreateEmbeddingThemeMutation } from "metabase/api/embedding-theme";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import * as Errors from "metabase/lib/errors";
import { Box, Button, FocusTrap, Group, Modal, Stack, Text } from "metabase/ui";
import type { EmbeddingTheme } from "metabase-types/api";

const CREATE_THEME_SCHEMA = Yup.object({
  name: Yup.string().required(Errors.required),
});

type CreateThemeValues = Yup.InferType<typeof CREATE_THEME_SCHEMA>;

type CreateEmbeddingThemeModalProps = {
  opened: boolean;
  onClose: () => void;
  onCreate?: (theme: EmbeddingTheme) => void;
};

export function CreateEmbeddingThemeModal({
  opened,
  onClose,
  onCreate,
}: CreateEmbeddingThemeModalProps) {
  const [createTheme] = useCreateEmbeddingThemeMutation();

  const handleSubmit = async (values: CreateThemeValues) => {
    const theme = await createTheme({
      name: values.name,
      settings: {},
    }).unwrap();

    onCreate?.(theme);
    onClose();
  };

  return (
    <Modal
      title={<Text size="xl" mb="sm">{t`Create a theme`}</Text>}
      opened={opened}
      padding="xl"
      onClose={onClose}
    >
      <FocusTrap.InitialFocus />

      <FormProvider
        initialValues={{ name: "" }}
        validationSchema={CREATE_THEME_SCHEMA}
        onSubmit={handleSubmit}
      >
        <Form>
          <Stack gap="lg">
            <FormTextInput
              name="name"
              label={t`Theme name`}
              placeholder={t`Dark`}
            />

            <Group>
              <Box flex={1}>
                <FormErrorMessage />
              </Box>

              <Button variant="subtle" onClick={onClose}>{t`Cancel`}</Button>
              <FormSubmitButton label={t`Create`} variant="filled" />
            </Group>
          </Stack>
        </Form>
      </FormProvider>
    </Modal>
  );
}
