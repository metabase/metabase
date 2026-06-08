import { useCallback } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";
import * as Yup from "yup";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import { useDispatch } from "metabase/redux";
import { Box, Button, Flex, Group, Stack, Text, Title } from "metabase/ui";
import * as Errors from "metabase/utils/errors";
import { useCreateDataAppMutation } from "metabase/api";

import {
  JsBundleDropzone,
  MAX_BUNDLE_BYTES,
  hasAllowedExtension,
} from "./JsBundleDropzone";

type FormState = {
  name: string;
  display_name: string;
  file: File | null;
};

const initialValues: FormState = {
  name: "",
  display_name: "",
  file: null,
};

const validationSchema: Yup.SchemaOf<FormState> = Yup.object({
  name: Yup.string().required(Errors.required),
  display_name: Yup.string().required(Errors.required),
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

export function DataAppFormPage() {
  const dispatch = useDispatch();
  const [createDataApp] = useCreateDataAppMutation();

  const submitValues = useCallback(
    async (values: FormState) => {
      const file = values.file;
      if (!file) {
        return;
      }
      await createDataApp({
        name: values.name.trim(),
        display_name: values.display_name.trim(),
        file,
      }).unwrap();
      dispatch(push("/admin/settings/data-apps"));
    },
    [createDataApp, dispatch],
  );

  const handleCancel = useCallback(() => {
    dispatch(push("/admin/settings/data-apps"));
  }, [dispatch]);

  return (
    <SettingsPageWrapper>
      <Stack gap="0">
        <Flex justify="space-between">
          <Title order={1} style={{ height: "2.5rem" }}>
            {t`Data apps`}
          </Title>
        </Flex>
        <Text c="text-secondary" maw="40rem">
          {t`Upload a single index.js bundle that follows the data-app conventions.`}
        </Text>
      </Stack>

      <SettingsSection>
        <Box bdrs="md" bg="background-primary">
          <FormProvider
            initialValues={initialValues}
            validationSchema={validationSchema}
            onSubmit={submitValues}
          >
            {({ dirty }) => (
              <Form>
                <Stack gap="40px">
                  <Stack gap="md">
                    <Title order={2}>{t`Add a new data app`}</Title>
                    <Text c="text-secondary">
                      {t`Provide a unique name, a display name, and the data app's index.js bundle.`}
                    </Text>
                  </Stack>

                  <FormTextInput
                    name="name"
                    label={t`Name`}
                    description={t`Short identifier. Reserved for future URL use.`}
                    placeholder="my-app"
                  />
                  <FormTextInput
                    name="display_name"
                    label={t`Display name`}
                    placeholder={t`My data app`}
                  />

                  <JsBundleDropzone />
                  <FormErrorMessage />

                  <Group gap="sm" justify="flex-end">
                    <Button variant="default" onClick={handleCancel}>
                      {t`Cancel`}
                    </Button>
                    <FormSubmitButton
                      label={t`Add data app`}
                      disabled={!dirty}
                      variant="filled"
                    />
                  </Group>
                </Stack>
              </Form>
            )}
          </FormProvider>
        </Box>
      </SettingsSection>
    </SettingsPageWrapper>
  );
}
