import { useCallback, useMemo } from "react";
import { t } from "ttag";
import * as Yup from "yup";

import { isErrorWithMessage } from "metabase/admin/performance/utils";
import {
  useGetAdminSettingsDetailsQuery,
  useGetSettingsQuery,
} from "metabase/api";
import {
  useDeleteEmailSMTPSettingsMutation,
  useSendTestEmailMutation,
  useUpdateCloudEmailSMTPSettingsMutation,
} from "metabase/api/email";
import { useSetting, useToast } from "metabase/common/hooks";
import {
  Form,
  FormProvider,
  FormRadioGroup,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import { color } from "metabase/lib/colors";
import * as Errors from "metabase/lib/errors";
import {
  Box,
  Button,
  Flex,
  Group,
  Modal,
  Radio,
  Stack,
  Text,
} from "metabase/ui";
import type {
  CloudEmailSMTPSettings,
  SettingDefinitionMap,
} from "metabase-types/api";

import { SetByEnvVarWrapper } from "../widgets/AdminSettingInput";

const emailSettingKeys = [
  "cloud-email-smtp-host",
  "cloud-email-smtp-port",
  "cloud-email-smtp-security",
  "cloud-email-smtp-username",
  "cloud-email-smtp-password",
] as const;

const anySchema = Yup.mixed().nullable().default(null);

// we need to allow this form to be submitted even when we have removed certain inputs
// when they are set by env vars
const getFormValueSchema = (
  settingsDetails: SettingDefinitionMap | undefined,
) => {
  return Yup.object({
    "email-smtp-host": settingsDetails?.["email-smtp-host"]?.is_env_setting
      ? anySchema
      : Yup.string().required(Errors.required).default(""),
    "email-smtp-port": settingsDetails?.["email-smtp-port"]?.is_env_setting
      ? anySchema
      : Yup.number()
          .positive()
          .nullable()
          .required(Errors.required)
          .default(null),
    "email-smtp-security": settingsDetails?.["email-smtp-security"]
      ?.is_env_setting
      ? anySchema
      : Yup.string().default("none"),
    "email-smtp-username": settingsDetails?.["email-smtp-username"]
      ?.is_env_setting
      ? anySchema
      : Yup.string().default(""),
    "email-smtp-password": settingsDetails?.["email-smtp-password"]
      ?.is_env_setting
      ? anySchema
      : Yup.string().default(""),
  });
};

export const CloudSMTPConnectionForm = ({
  onClose,
}: {
  onClose: () => void;
}) => {
  const [updateCloudEmailSMTPSettings] =
    useUpdateCloudEmailSMTPSettingsMutation();
  const [sendTestEmail, sendTestEmailResult] = useSendTestEmailMutation();
  const [deleteEmailSMTPSettings] = useDeleteEmailSMTPSettingsMutation();
  const [sendToast] = useToast();
  const { data: settingValues } = useGetSettingsQuery();
  const { data: settingsDetails } = useGetAdminSettingsDetailsQuery();
  const isHosted = useSetting("is-hosted?");
  const initialValues = useMemo<CloudEmailSMTPSettings>(
    () => ({
      "cloud-email-smtp-host": settingValues?.["cloud-email-smtp-host"] ?? "",
      "cloud-email-smtp-port": settingValues?.["cloud-email-smtp-port"] ?? 456,
      "cloud-email-smtp-security":
        settingValues?.["cloud-email-smtp-security"] ?? "ssl",
      "cloud-email-smtp-username":
        settingValues?.["cloud-email-smtp-username"] ?? "",
      "cloud-email-smtp-password":
        settingValues?.["cloud-email-smtp-password"] ?? "",
    }),
    [settingValues],
  );
  const handleClearEmailSettings = useCallback(async () => {
    const result = await deleteEmailSMTPSettings();
    if (result.error) {
      sendToast({
        icon: "warning",
        toastColor: "error",
        message: isErrorWithMessage(result.error)
          ? result.error.data.message
          : t`Error clearing email settings`,
      });
    } else {
      sendToast({
        message: t`Email settings cleared`,
      });
    }
  }, [deleteEmailSMTPSettings, sendToast]);

  const handleUpdateEmailSettings = useCallback(
    async (formData: CloudEmailSMTPSettings) => {
      const result = await updateCloudEmailSMTPSettings(formData);
      if (result.error) {
        sendToast({
          icon: "warning",
          toastColor: "error",
          message: isErrorWithMessage(result.error)
            ? result.error.data.message
            : t`Error updating email settings`,
        });
      } else {
        sendToast({
          message: t`Email settings updated`,
        });
        onClose();
      }
    },
    [updateCloudEmailSMTPSettings, sendToast, onClose],
  );

  const handleSendTestEmail = useCallback(async () => {
    try {
      await sendTestEmail().unwrap();
      sendToast({
        message: t`Email sent!`,
        toastColor: "success",
      });
    } catch (error) {
      sendToast({
        icon: "warning",
        toastColor: "error",
        message: getTestEmailErrorMessage(error),
      });
    }
  }, [sendTestEmail, sendToast]);

  const allSetByEnvVars = useMemo(() => {
    return (
      settingsDetails &&
      emailSettingKeys.every(
        (settingKey) => settingsDetails[settingKey]?.is_env_setting,
      )
    );
  }, [settingsDetails]);

  return (
    <Modal title={t`SMTP Configuration`} opened onClose={onClose} padding="xl">
      <Box data-testid="settings-updates" pt="lg">
        <FormProvider
          initialValues={initialValues}
          validationSchema={getFormValueSchema(settingsDetails)}
          onSubmit={handleUpdateEmailSettings}
          enableReinitialize
        >
          {({ dirty, isValid, isSubmitting, values }) => (
            <Form>
              <Stack gap="lg">
                <SetByEnvVarWrapper
                  settingKey="cloud-email-smtp-host"
                  settingDetails={settingsDetails?.["cloud-email-smtp-host"]}
                >
                  <FormTextInput
                    name="cloud-email-smtp-host"
                    label={t`SMTP Host`}
                    description={
                      settingsDetails?.["cloud-email-smtp-host"]?.description
                    }
                    placeholder={"smtp.yourservice.com"}
                  />
                </SetByEnvVarWrapper>
                <SetByEnvVarWrapper
                  settingKey="cloud-email-smtp-port"
                  settingDetails={settingsDetails?.["cloud-email-smtp-port"]}
                >
                  <FormTextInput
                    name="cloud-email-smtp-port"
                    label={t`SMTP Port`}
                    placeholder={"587"}
                  />
                </SetByEnvVarWrapper>
                <SetByEnvVarWrapper
                  settingKey="cloud-email-smtp-security"
                  settingDetails={
                    settingsDetails?.["cloud-email-smtp-security"]
                  }
                >
                  <FormRadioGroup
                    name="cloud-email-smtp-security"
                    label={t`SMTP Security`}
                  >
                    <Group>
                      {[
                        { value: "none", name: "None" },
                        { value: "ssl", name: "SSL" },
                        { value: "tls", name: "TLS" },
                        { value: "starttls", name: "STARTTLS" },
                      ].map(({ value, name }) => (
                        <Radio
                          value={value as string}
                          name="cloud-email-smtp-security"
                          label={name}
                          key={name}
                          styles={{
                            inner: { display: "none" },
                            label: {
                              paddingLeft: 0,
                              color:
                                values["cloud-email-smtp-security"] === value
                                  ? color("brand")
                                  : color("text-dark"),
                            },
                          }}
                        />
                      ))}
                    </Group>
                  </FormRadioGroup>
                </SetByEnvVarWrapper>
                <SetByEnvVarWrapper
                  settingKey="cloud-email-smtp-username"
                  settingDetails={
                    settingsDetails?.["cloud-email-smtp-username"]
                  }
                >
                  <FormTextInput
                    name="cloud-email-smtp-username"
                    label={t`SMTP Username`}
                    placeholder={"nicetoseeyou"}
                  />
                </SetByEnvVarWrapper>
                {!isHosted && (
                  <SetByEnvVarWrapper
                    settingKey="cloud-email-smtp-password"
                    settingDetails={
                      settingsDetails?.["cloud-email-smtp-password"]
                    }
                  >
                    <FormTextInput
                      name="cloud-email-smtp-password"
                      type="password"
                      label={t`SMTP Password`}
                      placeholder={"Shhh..."}
                    />
                  </SetByEnvVarWrapper>
                )}

                {Boolean(sendTestEmailResult.error) && (
                  <Text
                    role="alert"
                    aria-label={getTestEmailErrorMessage(
                      sendTestEmailResult.error,
                    )}
                    color="error"
                    mb="1rem"
                  >
                    {getTestEmailErrorMessage(sendTestEmailResult.error)}
                  </Text>
                )}
                <Flex mt="1rem" gap="md" justify="end">
                  {!dirty && isValid && !isSubmitting && (
                    <Button onClick={handleSendTestEmail}>
                      {sendTestEmailResult.isLoading
                        ? t`Sending...`
                        : t`Send test email`}
                    </Button>
                  )}
                  <Button
                    onClick={handleClearEmailSettings}
                    disabled={allSetByEnvVars}
                  >
                    {t`Clear`}
                  </Button>
                  <FormSubmitButton
                    label={t`Save changes`}
                    disabled={!dirty || !isValid || isSubmitting}
                    variant="filled"
                  />
                </Flex>
              </Stack>
            </Form>
          )}
        </FormProvider>
      </Box>
    </Modal>
  );
};

function getTestEmailErrorMessage(error: unknown): string {
  return isErrorWithMessage(error)
    ? error.data.message
    : t`Error sending test email`;
}
