import { useCallback } from "react";
import { t } from "ttag";

import { SettingsSection } from "metabase/admin/components/SettingsSection";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import { Group, Stack } from "metabase/ui";
import { useCreateDevCustomVizPluginMutation } from "metabase-enterprise/api";

type FormState = {
  devBundleUrl: string;
};

const DEFAULT_DEV_BUNDLE_URL = "http://localhost:5174";

const initialValues: FormState = { devBundleUrl: DEFAULT_DEV_BUNDLE_URL };

export function AddDevCustomVizForm() {
  const [createDevPlugin] = useCreateDevCustomVizPluginMutation();

  const handleSubmit = useCallback(
    (values: FormState) =>
      createDevPlugin({
        dev_bundle_url: values.devBundleUrl,
      }).unwrap(),
    [createDevPlugin],
  );

  return (
    <SettingsSection>
      <FormProvider initialValues={initialValues} onSubmit={handleSubmit}>
        {({ values }) => (
          <Form>
            <Stack gap="lg">
              <FormTextInput
                name="devBundleUrl"
                label={t`Dev server URL`}
                description={t`URL of the local dev server serving the visualization bundle, manifest, and assets.`}
                placeholder={DEFAULT_DEV_BUNDLE_URL}
                autoFocus
              />
              <FormErrorMessage />
              <Group justify="flex-end">
                <FormSubmitButton
                  label={t`Enable`}
                  disabled={!values.devBundleUrl}
                  variant="filled"
                />
              </Group>
            </Stack>
          </Form>
        )}
      </FormProvider>
    </SettingsSection>
  );
}
