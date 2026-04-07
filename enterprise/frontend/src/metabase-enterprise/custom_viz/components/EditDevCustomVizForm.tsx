import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { SettingsSection } from "metabase/admin/components/SettingsSection";
import {
  useDeleteCustomVizPluginMutation,
  useSetCustomVizPluginDevUrlMutation,
} from "metabase/api";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import { Box, Button, Group, Stack, Text } from "metabase/ui";
import type { CustomVizPlugin } from "metabase-types/api";

type Props = {
  plugin: CustomVizPlugin;
};

type FormState = {
  devBundleUrl: string;
};

export function EditDevCustomVizForm({ plugin }: Props) {
  const [setDevUrl] = useSetCustomVizPluginDevUrlMutation();
  const [deletePlugin] = useDeleteCustomVizPluginMutation();

  const initialValues = useMemo<FormState>(
    () => ({ devBundleUrl: plugin.dev_bundle_url ?? "" }),
    [plugin.dev_bundle_url],
  );

  const handleSubmit = useCallback(
    (values: FormState) =>
      setDevUrl({
        id: plugin.id,
        dev_bundle_url: values.devBundleUrl || null,
      }).unwrap(),
    [plugin.id, setDevUrl],
  );

  const handleRemove = useCallback(
    () => deletePlugin(plugin.id).unwrap(),
    [plugin.id, deletePlugin],
  );

  return (
    <SettingsSection>
      <FormProvider
        initialValues={initialValues}
        onSubmit={handleSubmit}
        enableReinitialize
      >
        {({ dirty }) => (
          <Form>
            <Stack gap="lg">
              <Group gap="sm" align="center">
                {plugin.dev_bundle_url && (
                  <Box
                    w={8}
                    h={8}
                    bdrs="xl"
                    bg="success"
                    style={{ flexShrink: 0 }}
                  />
                )}
                <Text fw={700} fz="lg">
                  {plugin.display_name}
                </Text>
              </Group>
              <FormTextInput
                name="dev_bundle_url"
                label={t`Dev server URL`}
                placeholder="http://localhost:5174"
              />
              <FormErrorMessage />
              <Group justify="flex-end">
                <Button variant="subtle" color="error" onClick={handleRemove}>
                  {t`Remove`}
                </Button>
                <FormSubmitButton
                  label={t`Save`}
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
