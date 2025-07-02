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
  useUpdateEmailSMTPSettingsMutation,
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
  EmailSMTPSettings,
  SettingDefinitionMap,
  Settings,
} from "metabase-types/api";

import { SetByEnvVarWrapper } from "../widgets/AdminSettingInput";

const emailSettingKeys = [
  "email-smtp-host",
  "email-smtp-port",
  "email-smtp-security",
  "email-smtp-username",
  "email-smtp-password",
] as const;

type FormValueProps = Pick<
  Settings,
  | "email-smtp-host"
  | "email-smtp-port"
  | "email-smtp-security"
  | "email-smtp-username"
  | "email-smtp-password"
>;

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

export const SMTPConnectionForm = ({ onClose }: { onClose: () => void }) => {
  const [updateEmailSMTPSettings] = useUpdateEmailSMTPSettingsMutation();
  const [sendTestEmail, sendTestEmailResult] = useSendTestEmailMutation();
  const [deleteEmailSMTPSettings] = useDeleteEmailSMTPSettingsMutation();
  const [sendToast] = useToast();
  const { data: settingValues } = useGetSettingsQuery();
  const { data: settingsDetails } = useGetAdminSettingsDetailsQuery();
  const isHosted = useSetting("is-hosted?");
  const initialValues = useMemo<FormValueProps>(
    () => ({
      "email-smtp-host": settingValues?.["email-smtp-host"] ?? null,
      "email-smtp-port": settingValues?.["email-smtp-port"] ?? null,
      "email-smtp-security": settingValues?.["email-smtp-security"] ?? "none",
      "email-smtp-username": settingValues?.["email-smtp-username"] ?? "",
      "email-smtp-password": settingValues?.["email-smtp-password"] ?? "",
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
    async (formData: EmailSMTPSettings) => {
      const result = await updateEmailSMTPSettings(formData);
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
    [updateEmailSMTPSettings, sendToast, onClose],
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
                  settingKey="email-smtp-host"
                  settingDetails={settingsDetails?.["email-smtp-host"]}
                >
                  <FormTextInput
                    name="email-smtp-host"
                    label={t`SMTP Host`}
                    description={
                      settingsDetails?.["email-smtp-host"]?.description
                    }
                    placeholder={"smtp.yourservice.com"}
                  />
                </SetByEnvVarWrapper>
                <SetByEnvVarWrapper
                  settingKey="email-smtp-port"
                  settingDetails={settingsDetails?.["email-smtp-port"]}
                >
                  <FormTextInput
                    name="email-smtp-port"
                    label={t`SMTP Port`}
                    placeholder={"587"}
                  />
                </SetByEnvVarWrapper>
                <SetByEnvVarWrapper
                  settingKey="email-smtp-security"
                  settingDetails={settingsDetails?.["email-smtp-security"]}
                >
                  <FormRadioGroup
                    name="email-smtp-security"
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
                          name="email-smtp-security"
                          label={name}
                          key={name}
                          styles={{
                            inner: { display: "none" },
                            label: {
                              paddingLeft: 0,
                              color:
                                values["email-smtp-security"] === value
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
                  settingKey="email-smtp-username"
                  settingDetails={settingsDetails?.["email-smtp-username"]}
                >
                  <FormTextInput
                    name="email-smtp-username"
                    label={t`SMTP Username`}
                    placeholder={"nicetoseeyou"}
                  />
                </SetByEnvVarWrapper>
                {!isHosted && (
                  <SetByEnvVarWrapper
                    settingKey="email-smtp-password"
                    settingDetails={settingsDetails?.["email-smtp-password"]}
                  >
                    <FormTextInput
                      name="email-smtp-password"
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
