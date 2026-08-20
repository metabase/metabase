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

import { fetchDevServerManifest } from "../dev-server";
import { getDevUrlError } from "../dev-url-validation";

type FormState = {
  devBundleUrl: string;
};

const DEFAULT_DEV_BUNDLE_URL = "http://localhost:5174";

const initialValues: FormState = { devBundleUrl: DEFAULT_DEV_BUNDLE_URL };

export function AddDevCustomVizForm() {
  const [createDevPlugin] = useCreateDevCustomVizPluginMutation();

  const handleSubmit = useCallback(
    async (values: FormState) => {
      const devBundleUrl = values.devBundleUrl;

      const urlError = getDevUrlError(devBundleUrl);
      if (urlError) {
        throw new Error(urlError);
      }

      // The browser reads the manifest, because Metabase never requests the dev URL itself. A dev server
      // that is not running is the common case here, so say so rather than surfacing a bare fetch error.
      let manifest;
      try {
        manifest = await fetchDevServerManifest(devBundleUrl);
      } catch {
        throw new Error(
          t`Couldn't reach the dev server at ${devBundleUrl}. Check that it's running.`,
        );
      }

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
