import { useCallback, useMemo } from "react";
import { t } from "ttag";
import * as Yup from "yup";

import { SettingsSection } from "metabase/admin/components/SettingsSection";
import { useCreateDevCustomVizPluginMutation } from "metabase/api";
import {
  Form,
  FormCheckbox,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import { Group, Stack } from "metabase/ui";

type FormState = {
  devBundleUrl: string;
  acknowledgedRisk: boolean;
};

const initialValues: FormState = { devBundleUrl: "", acknowledgedRisk: false };

export function AddDevCustomVizForm() {
  const [createDevPlugin] = useCreateDevCustomVizPluginMutation();

  const validationSchema = useMemo(
    () =>
      Yup.object({
        acknowledgedRisk: Yup.boolean().oneOf(
          [true],
          t`You must acknowledge the security risk before proceeding.`,
        ),
      }),
    [],
  );

  const handleSubmit = useCallback(
    (values: FormState) =>
      createDevPlugin({
        dev_bundle_url: values.devBundleUrl,
      }).unwrap(),
    [createDevPlugin],
  );

  return (
    <SettingsSection>
      <FormProvider
        initialValues={initialValues}
        validationSchema={validationSchema}
        onSubmit={handleSubmit}
      >
        {({ dirty }) => (
          <Form>
            <Stack gap="lg">
              <FormTextInput
                name="devBundleUrl"
                label={t`Dev server URL`}
                description={t`URL of the local dev server serving the visualization bundle, manifest, and assets.`}
                placeholder="http://localhost:5174"
                autoFocus
              />
              <FormCheckbox
                name="acknowledgedRisk"
                label={t`I understand that custom visualizations can execute arbitrary code and should only be added from trusted sources.`}
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
