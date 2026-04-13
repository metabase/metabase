import { useCallback, useEffect, useMemo } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";
import * as Yup from "yup";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import {
  useCreateCustomVizPluginMutation,
  useListAllCustomVizPluginsQuery,
  useUpdateCustomVizPluginMutation,
} from "metabase/api";
import {
  Form,
  FormCheckbox,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import { Box, Button, Group, Stack, Text } from "metabase/ui";
import { useDispatch } from "metabase/utils/redux";
import * as Urls from "metabase/utils/urls";

type Props = {
  params?: {
    id?: string;
  };
};

type FormState = {
  repoUrl: string;
  accessToken: string;
  pinnedVersion: string;
  acknowledgedRisk: boolean;
};

export function CustomVizPage({ params }: Props) {
  const dispatch = useDispatch();
  const pluginId = params?.id ? parseInt(params.id, 10) : undefined;
  const { data: plugins } = useListAllCustomVizPluginsQuery();
  const plugin = pluginId ? plugins?.find((p) => p.id === pluginId) : undefined;
  const isEdit = pluginId !== undefined;

  const [createPlugin] = useCreateCustomVizPluginMutation();
  const [updatePlugin] = useUpdateCustomVizPluginMutation();

  const validationSchema = useMemo(
    () =>
      isEdit
        ? undefined
        : Yup.object({
            acknowledgedRisk: Yup.boolean().oneOf(
              [true],
              t`You must acknowledge the security risk before proceeding.`,
            ),
          }),
    [isEdit],
  );

  const initialValues = useMemo<FormState>(
    () => ({
      repoUrl: plugin?.repo_url ?? "",
      accessToken: "",
      pinnedVersion: plugin?.pinned_version ?? "",
      acknowledgedRisk: isEdit,
    }),
    [plugin, isEdit],
  );

  const handleSubmit = useCallback(
    async (values: FormState) => {
      if (isEdit && plugin) {
        await updatePlugin({
          id: plugin.id,
          access_token: values.accessToken || undefined,
          pinned_version: values.pinnedVersion || null,
        }).unwrap();
      } else {
        await createPlugin({
          repo_url: values.repoUrl,
          access_token: values.accessToken || undefined,
          pinned_version: values.pinnedVersion || null,
        }).unwrap();
      }
      dispatch(push(Urls.customViz()));
    },
    [createPlugin, updatePlugin, plugin, isEdit, dispatch],
  );

  const handleCancel = useCallback(() => {
    dispatch(push(Urls.customViz()));
  }, [dispatch]);

  const shouldRedirectToList = isEdit && !plugin && !!plugins;
  const shouldRedirectToDev = isEdit && !!plugin?.dev_only;

  useEffect(() => {
    if (shouldRedirectToList) {
      dispatch(push(Urls.customViz()));
    }
  }, [shouldRedirectToList, dispatch]);

  useEffect(() => {
    if (shouldRedirectToDev) {
      dispatch(push(Urls.customVizDev()));
    }
  }, [shouldRedirectToDev, dispatch]);

  if (shouldRedirectToList || shouldRedirectToDev) {
    return null;
  }

  return (
    <SettingsPageWrapper
      title={t`Manage custom visualizations`}
      description={t`Add custom visualizations to your instance here by adding links to git repositories containing custom visualization bundles.`}
    >
      <SettingsSection>
        <Box bdrs="md" bg="background-primary">
          <FormProvider
            initialValues={initialValues}
            validationSchema={validationSchema}
            onSubmit={handleSubmit}
          >
            {({ dirty }) => (
              <Form>
                <Stack gap="lg">
                  <Text fw={700} fz="xl">
                    {isEdit
                      ? t`Edit visualization`
                      : t`Add a new visualization`}
                  </Text>
                  <FormTextInput
                    name="repoUrl"
                    label={t`Repository URL`}
                    description={t`The location of the git repository where your visualization bundle is.`}
                    placeholder="https://github.com/user/custom-viz-plugin"
                    disabled={isEdit}
                    autoFocus={!isEdit}
                  />
                  <FormTextInput
                    name="accessToken"
                    label={t`Repository access token (optional)`}
                    description={t`Personal access token for private repositories.`}
                    type="password"
                  />
                  <FormTextInput
                    name="pinnedVersion"
                    label={t`Pinned version (optional)`}
                    description={t`Branch, tag, or commit SHA to pin to.`}
                    placeholder="main"
                  />
                  {!isEdit && (
                    <FormCheckbox
                      name="acknowledgedRisk"
                      label={t`I understand that custom visualizations can execute arbitrary code and should only be added from trusted sources.`}
                    />
                  )}
                  <FormErrorMessage />
                  <Group gap="sm" justify="flex-end">
                    <Button variant="default" onClick={handleCancel}>
                      {t`Cancel`}
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
        </Box>
      </SettingsSection>
    </SettingsPageWrapper>
  );
}
