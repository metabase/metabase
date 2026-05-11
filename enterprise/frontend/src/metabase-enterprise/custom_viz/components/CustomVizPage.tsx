import { useCallback, useEffect } from "react";
import { push } from "react-router-redux";
import { jt, t } from "ttag";
import * as Yup from "yup";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import { ExternalLink } from "metabase/common/components/ExternalLink";
import { useDocsUrl } from "metabase/common/hooks";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
} from "metabase/forms";
import { useDispatch } from "metabase/redux";
import {
  Box,
  Button,
  Code,
  Flex,
  Group,
  Stack,
  Text,
  Title,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import * as Errors from "metabase/utils/errors";
import {
  useCreateCustomVizPluginMutation,
  useListAllCustomVizPluginsQuery,
  useReplaceCustomVizPluginBundleMutation,
} from "metabase-enterprise/api";

import {
  trackCustomVizPluginCreated,
  trackCustomVizPluginUpdated,
} from "../analytics";

import {
  BundleDropzone,
  MAX_BUNDLE_BYTES,
  hasAllowedExtension,
} from "./BundleDropzone";

type Props = {
  params?: {
    id?: string;
  };
};

type FormState = {
  file: File | null;
};

const initialValues: FormState = { file: null };

const validationSchema: Yup.SchemaOf<FormState> = Yup.object({
  file: Yup.mixed<File>()
    .nullable()
    .required(Errors.required)
    .test(
      "valid-extension",
      () => t`Bundle must be a .tgz file produced by "npm run build".`,
      (value) => !!value && hasAllowedExtension(value.name),
    )
    .test(
      "valid-size",
      () => t`Bundle must be smaller than 5 MB.`,
      (value) => !!value && value.size <= MAX_BUNDLE_BYTES,
    ),
});

export function CustomVizPage({ params }: Props) {
  const dispatch = useDispatch();
  const pluginId = params?.id ? parseInt(params.id, 10) : undefined;
  const { data: plugins } = useListAllCustomVizPluginsQuery();
  const plugin = pluginId ? plugins?.find((p) => p.id === pluginId) : undefined;
  const isEdit = pluginId !== undefined;

  const [createPlugin] = useCreateCustomVizPluginMutation();
  const [replaceBundle] = useReplaceCustomVizPluginBundleMutation();

  // eslint-disable-next-line metabase/no-unconditional-metabase-links-render -- Admin settings
  const { url: docsUrl } = useDocsUrl(
    "questions/visualizations/custom-visualizations",
  );

  const submitValues = useCallback(
    async (values: FormState) => {
      const file = values.file;
      if (!file) {
        return;
      }
      if (isEdit && plugin) {
        try {
          await replaceBundle({ id: plugin.id, file }).unwrap();
          trackCustomVizPluginUpdated("success");
        } catch (error) {
          trackCustomVizPluginUpdated("failure");
          throw error;
        }
      } else {
        try {
          await createPlugin({ file }).unwrap();
          trackCustomVizPluginCreated("success");
        } catch (error) {
          trackCustomVizPluginCreated("failure");
          throw error;
        }
      }
      dispatch(push(Urls.customViz()));
    },
    [createPlugin, replaceBundle, plugin, isEdit, dispatch],
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

  if (isEdit && !plugin) {
    return null;
  }

  const description = isEdit
    ? t`Upload a new packaged bundle (.tgz) to replace this visualization. The bundle's manifest "name" must match the existing identifier.`
    : t`Upload a packaged bundle (.tgz) produced by running "npm run build" in your custom-viz project.`;

  return (
    <SettingsPageWrapper>
      <Stack gap="0">
        <Flex justify="space-between">
          <Title order={1} style={{ height: "2.5rem" }}>
            {t`Custom visualizations`}
          </Title>
        </Flex>

        <Text c="text-secondary" maw="40rem">
          {description}
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
          >
            {({ dirty }) => (
              <Form>
                <Stack gap="40px">
                  <Stack gap="md">
                    <Title order={2}>
                      {isEdit && plugin
                        ? t`Replace bundle for ${plugin.display_name}`
                        : t`Add a new visualization`}
                    </Title>
                    {!isEdit && (
                      <Text c="text-secondary">
                        {jt`Create a custom visualization bundle by running ${(
                          <Code key="cmd">{t`npm run build`}</Code>
                        )} in your custom visualization project. ${(
                          <ExternalLink
                            key="docs"
                            href={docsUrl}
                          >{t`Read the docs`}</ExternalLink>
                        )}.`}
                      </Text>
                    )}
                  </Stack>
                  <BundleDropzone />
                  <FormErrorMessage />
                  <Group gap="sm" justify="flex-end">
                    <Button variant="default" onClick={handleCancel}>
                      {t`Cancel`}
                    </Button>
                    <FormSubmitButton
                      label={isEdit ? t`Replace` : t`Add visualization`}
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
