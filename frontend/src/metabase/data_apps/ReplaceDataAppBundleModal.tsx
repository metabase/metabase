import { useCallback } from "react";
import { t } from "ttag";
import * as Yup from "yup";

import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
} from "metabase/forms";
import { Button, Group, Modal, Stack, Text } from "metabase/ui";
import * as Errors from "metabase/utils/errors";
import { useUpdateDataAppMutation } from "metabase/api";
import type { DataApp } from "metabase-types/api";

import {
  JsBundleDropzone,
  MAX_BUNDLE_BYTES,
  hasAllowedExtension,
} from "./JsBundleDropzone";

type FormState = { file: File | null };

const initialValues: FormState = { file: null };

const validationSchema: Yup.SchemaOf<FormState> = Yup.object({
  file: Yup.mixed<File>()
    .nullable()
    .required(Errors.required)
    .test(
      "valid-extension",
      () => t`Bundle must be a .js file.`,
      (value) => !!value && hasAllowedExtension(value.name),
    )
    .test(
      "valid-size",
      () => t`Bundle must be smaller than 5 MB.`,
      (value) => !!value && value.size <= MAX_BUNDLE_BYTES,
    ),
});

type Props = {
  app: DataApp;
  opened: boolean;
  onClose: () => void;
};

export function ReplaceDataAppBundleModal({ app, opened, onClose }: Props) {
  const [updateDataApp] = useUpdateDataAppMutation();

  const handleSubmit = useCallback(
    async (values: FormState) => {
      if (!values.file) {
        return;
      }
      await updateDataApp({ name: app.name, file: values.file }).unwrap();
      onClose();
    },
    [app.name, onClose, updateDataApp],
  );

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t`Replace bundle for ${app.display_name}`}
      size="lg"
    >
      <FormProvider
        initialValues={initialValues}
        validationSchema={validationSchema}
        onSubmit={handleSubmit}
      >
        {({ dirty }) => (
          <Form>
            <Stack gap="md">
              <Text c="text-secondary">
                {t`Upload a new index.js to replace the current bundle. The data app keeps the same name and URL.`}
              </Text>

              <JsBundleDropzone />
              <FormErrorMessage />

              <Group gap="sm" justify="flex-end">
                <Button variant="default" onClick={onClose}>
                  {t`Cancel`}
                </Button>
                <FormSubmitButton
                  label={t`Replace bundle`}
                  disabled={!dirty}
                  variant="filled"
                />
              </Group>
            </Stack>
          </Form>
        )}
      </FormProvider>
    </Modal>
  );
}
