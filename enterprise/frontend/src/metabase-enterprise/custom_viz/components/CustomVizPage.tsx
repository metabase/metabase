import { useCallback, useEffect, useMemo } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";
import * as Yup from "yup";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import {
  Form,
  FormCheckbox,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
  FormSwitch,
  FormTextInput,
} from "metabase/forms";
import { Box, Button, Flex, Group, Stack, Text, Title } from "metabase/ui";
import * as Errors from "metabase/utils/errors";
import { getUrlProtocol } from "metabase/utils/formatting/url";
import { useDispatch } from "metabase/utils/redux";
import * as Urls from "metabase/utils/urls";
import {
  useCreateCustomVizPluginMutation,
  useListAllCustomVizPluginsQuery,
  useUpdateCustomVizPluginMutation,
} from "metabase-enterprise/api";

import {
  trackCustomVizPluginCreated,
  trackCustomVizPluginUpdated,
} from "../analytics";

type Props = {
  params?: {
    id?: string;
  };
};

type FormState = {
  repoUrl: string;
  isPrivateRepo: boolean;
  accessToken: string;
  pinVersion: boolean;
  pinnedVersion: string;
};

const ALLOWED_REPO_URL_PROTOCOLS = new Set([
  "http:",
  "https:",
  "git:",
  "file:",
]);

const validationSchema: Yup.SchemaOf<FormState> = Yup.object({
  repoUrl: Yup.string()
    .default("")
    .required(Errors.required)
    .test(
      "valid-repo-url",
      () => t`Enter a valid URL (http://, https://, or git://).`,
      (value) => {
        const protocol = value ? getUrlProtocol(value) : undefined;
        return (
          protocol !== undefined && ALLOWED_REPO_URL_PROTOCOLS.has(protocol)
        );
      },
    ),
  isPrivateRepo: Yup.boolean().default(false),
  accessToken: Yup.string()
    .default("")
    .when("isPrivateRepo", {
      is: true,
      then: (schema) => schema.required(Errors.required),
    }),
  pinVersion: Yup.boolean().default(false),
  pinnedVersion: Yup.string()
    .default("")
    .when("pinVersion", {
      is: true,
      then: (schema) => schema.required(Errors.required),
    }),
});

export function CustomVizPage({ params }: Props) {
  const dispatch = useDispatch();
  const pluginId = params?.id ? parseInt(params.id, 10) : undefined;
  const { data: plugins } = useListAllCustomVizPluginsQuery();
  const plugin = pluginId ? plugins?.find((p) => p.id === pluginId) : undefined;
  const isEdit = pluginId !== undefined;

  const [createPlugin] = useCreateCustomVizPluginMutation();
  const [updatePlugin] = useUpdateCustomVizPluginMutation();

  const initialValues = useMemo<FormState>(
    () => ({
      repoUrl: plugin?.repo_url ?? "",
      isPrivateRepo: false,
      accessToken: "",
      pinVersion: !!plugin?.pinned_version,
      pinnedVersion: plugin?.pinned_version ?? "",
    }),
    [plugin?.repo_url, plugin?.pinned_version],
  );

  const submitValues = useCallback(
    async (values: FormState) => {
      const accessToken =
        values.isPrivateRepo && values.accessToken
          ? values.accessToken
          : undefined;
      const pinnedVersion =
        values.pinVersion && values.pinnedVersion ? values.pinnedVersion : null;

      if (isEdit && plugin) {
        try {
          await updatePlugin({
            id: plugin.id,
            access_token: accessToken,
            pinned_version: pinnedVersion,
          }).unwrap();
          trackCustomVizPluginUpdated("success");
        } catch (error) {
          trackCustomVizPluginUpdated("failure");
          throw error;
        }
      } else {
        try {
          await createPlugin({
            repo_url: values.repoUrl,
            access_token: accessToken,
            pinned_version: pinnedVersion,
          }).unwrap();
          trackCustomVizPluginCreated("success");
        } catch (error) {
          trackCustomVizPluginCreated("failure");
          throw error;
        }
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

  // Wait for the plugin to load in edit mode — rendering the form before it
  // arrives causes Formik's enableReinitialize to reset any user input once
  // the plugin data finally arrives.
  if (isEdit && !plugin) {
    return null;
  }

  return (
    <SettingsPageWrapper>
      <Stack gap="0">
        <Flex justify="space-between">
          <Title order={1} style={{ height: "2.5rem" }}>
            {t`Custom visualizations`}
          </Title>
        </Flex>

        <Text c="text-secondary" maw="40rem">
          {t`Add custom visualizations to your instance here by adding links to git repositories containing custom visualization bundles.`}
        </Text>
      </Stack>
      <SettingsSection>
        <Box
          bdrs="md"
          bg="background-primary"
          data-testid="custom-viz-settings-form"
        >
          <FormProvider
            initialValues={initialValues}
            validationSchema={validationSchema}
            onSubmit={submitValues}
            enableReinitialize
          >
            {({ dirty, values }) => (
              <Form>
                <Stack gap={0}>
                  <Title order={2} mb="2.5rem">
                    {isEdit
                      ? t`Edit visualization`
                      : t`Add a new visualization`}
                  </Title>
                  <FormTextInput
                    name="repoUrl"
                    label={t`Repository URL`}
                    description={t`The location of the git repository where your visualization bundle is.`}
                    placeholder="https://github.com/user/custom-viz-plugin"
                    disabled={isEdit}
                    autoFocus={!isEdit}
                    styles={{
                      description: { color: "var(--mb-color-text-tertiary)" },
                      root: { marginBottom: "1rem" },
                    }}
                  />
                  <Stack gap="md">
                    <FormCheckbox
                      name="isPrivateRepo"
                      label={t`This is a private repository`}
                    />
                    {values.isPrivateRepo && (
                      <FormTextInput
                        name="accessToken"
                        label={t`Repository personal access token`}
                        type="password"
                        placeholder="********************"
                        autoFocus
                      />
                    )}
                  </Stack>
                  <Stack gap="md" mt="2rem">
                    <Flex gap="sm" align="center">
                      <FormSwitch
                        size="sm"
                        name="pinVersion"
                        labelPosition="left"
                        styles={{ label: { fontWeight: 700 } }}
                        label={t`Pin to a specific version`}
                      />
                    </Flex>
                    {values.pinVersion && (
                      <FormTextInput
                        required
                        name="pinnedVersion"
                        aria-label={t`Pinned version`}
                        description={t`Branch, tag, or commit SHA to pin to.`}
                        placeholder="main"
                        autoFocus
                        styles={{
                          description: {
                            color: "var(--mb-color-text-tertiary)",
                          },
                        }}
                      />
                    )}
                  </Stack>
                  <FormErrorMessage />
                  <Group gap="sm" justify="flex-end">
                    <Button variant="default" onClick={handleCancel}>
                      {t`Cancel`}
                    </Button>
                    <FormSubmitButton
                      label={isEdit ? t`Save` : t`Add visualization`}
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
