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

import { DevServerError, fetchDevServerManifest } from "../dev-server";

type FormState = {
  devBundleUrl: string;
};

const DEFAULT_DEV_BUNDLE_URL = "http://localhost:5174";

const initialValues: FormState = { devBundleUrl: DEFAULT_DEV_BUNDLE_URL };

function getManifestErrorMessage(error: unknown): string {
  switch (error instanceof DevServerError ? error.kind : undefined) {
    case "invalid-url":
      return t`Enter the full dev server URL, including http://`;
    case "unreachable":
      return t`Couldn't reach that dev server. Is it running?`;
    case "invalid-manifest":
      return t`That URL answered with something other than a plugin manifest.`;
    default:
      return t`Couldn't read metabase-plugin.json from that dev server.`;
  }
}

export function AddDevCustomVizForm() {
  const [createDevPlugin] = useCreateDevCustomVizPluginMutation();

  const handleSubmit = useCallback(
    async ({ devBundleUrl }: FormState) => {
      const manifest = await fetchDevServerManifest(devBundleUrl).catch(
        (error) => {
          throw new Error(getManifestErrorMessage(error));
        },
      );

      return createDevPlugin({
        dev_bundle_url: devBundleUrl,
        manifest,
      }).unwrap();
    },
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
