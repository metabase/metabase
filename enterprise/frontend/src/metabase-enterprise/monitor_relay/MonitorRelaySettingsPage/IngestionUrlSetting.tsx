import { t } from "ttag";

import { SetByEnvVar } from "metabase/common/components/SetByEnvVar";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import { useAdminSetting } from "metabase/settings";
import { SettingHeader } from "metabase/settings-components";
import { Box, Flex, Stack } from "metabase/ui";

import { MONITOR_NAME } from "./utils";

const NAME = "metabase-monitor-url";

/** The ingestion URL, saved with a button as the other admin forms are, rather than on blur: it holds a token. */
export function IngestionUrlSetting() {
  const { value, settingDetails, updateSetting, isLoading } =
    useAdminSetting(NAME);

  if (isLoading) {
    return null;
  }

  const title = t`Ingestion URL`;
  const description = t`Paste the URL that ${MONITOR_NAME} gave when you registered this instance, and save. Clear it and save to stop sending.`;

  if (settingDetails?.is_env_setting && settingDetails?.env_name) {
    return (
      <Box data-testid={`${NAME}-setting`}>
        <SettingHeader id={NAME} title={title} description={description} />
        <SetByEnvVar varName={settingDetails.env_name} />
      </Box>
    );
  }

  const onSubmit = async ({ url }: { url: string }) => {
    const { error } = await updateSetting({
      key: NAME,
      value: url,
      toast: false,
    });
    if (error) {
      throw error;
    }
  };

  return (
    <FormProvider
      initialValues={{ url: settingDetails?.value ?? value ?? "" }}
      enableReinitialize
      onSubmit={onSubmit}
    >
      {({ dirty }) => (
        <Form data-testid={`${NAME}-setting`}>
          <Stack gap="lg">
            <FormTextInput
              name="url"
              type="password"
              label={title}
              description={description}
            />
            <Flex justify="end">
              <FormSubmitButton
                label={t`Save changes`}
                variant="filled"
                disabled={!dirty}
              />
            </Flex>
            <FormErrorMessage />
          </Stack>
        </Form>
      )}
    </FormProvider>
  );
}
