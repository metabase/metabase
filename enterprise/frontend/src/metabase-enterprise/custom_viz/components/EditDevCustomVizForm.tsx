import { useCallback, useMemo } from "react";
import { match } from "ts-pattern";
import { t } from "ttag";

import { SettingsSection } from "metabase/admin/components/SettingsSection";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import { Button, Group, Icon, Stack, Text } from "metabase/ui";
import {
  useDeleteCustomVizPluginMutation,
  useSetCustomVizPluginDevUrlMutation,
} from "metabase-enterprise/api";
import type { CustomVizPlugin } from "metabase-types/api";

import { CustomVizIcon } from "./CustomVizIcon";

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
    () => ({
      devBundleUrl: plugin.dev_bundle_url ?? "",
    }),
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
        enableReinitialize
        initialValues={initialValues}
        onSubmit={handleSubmit}
      >
        {({ dirty }) => (
          <Form>
            <Stack gap="lg">
              <Group align="center">
                <CustomVizIcon plugin={plugin} />

                <Group align="center" flex="1" justify="space-between">
                  <Text fw={700} fz="lg">
                    {plugin.display_name}
                  </Text>

                  {match(plugin.status)
                    .with("active", () => (
                      <Group align="center" flex="0 0 auto" gap="xs">
                        <Icon c="success" name="check" />
                        <Text c="success" fw={700}>{t`Enabled`}</Text>
                      </Group>
                    ))
                    .with("error", () => (
                      <Text c="error" fw={700}>{t`Error`}</Text>
                    ))
                    .with("pending", () => (
                      <Text
                        c="text-secondary"
                        fw={plugin.enabled ? 700 : undefined}
                      >
                        {t`Pending`}
                      </Text>
                    ))
                    .exhaustive()}
                </Group>
              </Group>
              <FormTextInput
                name="devBundleUrl"
                label={t`Dev server URL`}
                placeholder="http://localhost:5174"
              />
              <FormErrorMessage />
              <Group justify="flex-end">
                <Button variant="subtle" color="error" onClick={handleRemove}>
                  {t`Disable`}
                </Button>
                <FormSubmitButton
                  label={t`Update`}
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
