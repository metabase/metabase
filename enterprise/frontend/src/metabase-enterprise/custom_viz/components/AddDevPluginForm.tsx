import { useCallback } from "react";
import { t } from "ttag";

import { SettingsSection } from "metabase/admin/components/SettingsSection";
import { useCreateDevCustomVizPluginMutation } from "metabase/api";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import { Group, Stack, Text } from "metabase/ui";

export function AddDevPluginForm() {
  const [createDevPlugin] = useCreateDevCustomVizPluginMutation();

  const handleSubmit = useCallback(
    (values: { dev_bundle_url: string }) =>
      createDevPlugin({
        dev_bundle_url: values.dev_bundle_url,
      }).unwrap(),
    [createDevPlugin],
  );

  return (
    <SettingsSection>
      <FormProvider
        initialValues={{ dev_bundle_url: "" }}
        onSubmit={handleSubmit}
      >
        {({ dirty }) => (
          <Form>
            <Stack gap="lg">
              <Text fw={700} fz="lg">
                {t`Add a dev visualization`}
              </Text>
              <FormTextInput
                name="dev_bundle_url"
                label={t`Dev server URL`}
                description={t`URL of the local dev server serving the visualization bundle.`}
                placeholder="http://localhost:5174"
                autoFocus
              />
              <FormErrorMessage />
              <Group justify="flex-end">
                <FormSubmitButton
                  label={t`Add`}
                  disabled={!dirty}
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
