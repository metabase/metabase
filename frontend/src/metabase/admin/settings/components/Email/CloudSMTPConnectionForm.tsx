import { useCallback, useMemo } from "react";
import { t } from "ttag";
import * as Yup from "yup";

import { isErrorWithMessage } from "metabase/admin/performance/utils";
import {
  useGetAdminSettingsDetailsQuery,
  useGetSettingsQuery,
} from "metabase/api";
import {
  useDeleteCloudEmailSMTPSettingsMutation,
  useSendTestEmailMutation,
  useUpdateCloudEmailSMTPSettingsMutation,
} from "metabase/api/email";
import { useSetting, useToast } from "metabase/common/hooks";
import {
  Form,
  FormChipGroup,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import * as Errors from "metabase/lib/errors";
import { Box, Button, Chip, Flex, Modal, Stack, Text } from "metabase/ui";
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

type FormValues = Omit<CloudEmailSMTPSettings, "cloud-email-smtp-port"> & {
  "cloud-email-smtp-port": string; // FormChip doesn't work well with integers
};

// we need to allow this form to be submitted even when we have removed certain inputs
// when they are set by env vars
const getFormValueSchema = (
  settingsDetails: SettingDefinitionMap | undefined,
) => {
  return Yup.object({
    "cloud-email-smtp-host": settingsDetails?.["email-smtp-host"]
      ?.is_env_setting
      ? anySchema
      : Yup.string().required(Errors.required).default(""),
    "cloud-email-smtp-port": settingsDetails?.["email-smtp-port"]
      ?.is_env_setting
      ? anySchema
      : Yup.string()
          .oneOf(["465", "587", "2525"], "Must be either 465, 587 or 2525")
          .nullable()
          // .required(Errors.required)
          .default("465"),
    "cloud-email-smtp-security": settingsDetails?.["email-smtp-security"]
      ?.is_env_setting
      ? anySchema
      : Yup.string()
          .oneOf(
            ["ssl", "tls", "starttls"],
            "Must be either SSL, TLS or STARTTLS",
          )
          .nullable()
          // .required(Errors.required)
          .default("ssl"),
    "cloud-email-smtp-username": settingsDetails?.["email-smtp-username"]
      ?.is_env_setting
      ? anySchema
      : Yup.string().default(""),
    "cloud-email-smtp-password": settingsDetails?.["email-smtp-password"]
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
  const [deleteCloudEmailSMTPSettings] =
    useDeleteCloudEmailSMTPSettingsMutation();
  const [sendToast] = useToast();
  const { data: settingValues } = useGetSettingsQuery();
  const { data: settingsDetails } = useGetAdminSettingsDetailsQuery();
  const isHosted = useSetting("is-hosted?");
  const initialValues = useMemo<FormValues>(
    () => ({
      "cloud-email-smtp-host": settingValues?.["cloud-email-smtp-host"] ?? "",
      "cloud-email-smtp-port": settingValues?.["cloud-email-smtp-port"]
        ? settingValues?.["cloud-email-smtp-port"] + ""
        : "465",
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
    const result = await deleteCloudEmailSMTPSettings();
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
  }, [deleteCloudEmailSMTPSettings, sendToast]);

  const handleUpdateEmailSettings = useCallback(
    async (formData: FormValues) => {
      const smtpPort = parseInt(
        formData["cloud-email-smtp-port"],
      ) as CloudEmailSMTPSettings["cloud-email-smtp-port"];
      const result = await updateCloudEmailSMTPSettings({
        ...formData,
        "cloud-email-smtp-port": smtpPort,
      });
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
          {({ dirty, isValid, isSubmitting }) => (
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
                  <FormChipGroup
                    name="cloud-email-smtp-port"
                    label={t`SMTP Port`}
                    groupProps={{ mt: "0.5rem" }}
                  >
                    <Chip value={"465"} variant="brand">
                      465
                    </Chip>
                    <Chip value={"587"} variant="brand">
                      587
                    </Chip>

                    <Chip value={"2525"} variant="brand">
                      2525
                    </Chip>
                  </FormChipGroup>
                </SetByEnvVarWrapper>
                <SetByEnvVarWrapper
                  settingKey="cloud-email-smtp-security"
                  settingDetails={
                    settingsDetails?.["cloud-email-smtp-security"]
                  }
                >
                  <FormChipGroup
                    name="cloud-email-smtp-security"
                    label={t`SMTP Security`}
                    groupProps={{ mt: "0.5rem" }}
                  >
                    <Chip value={"ssl"} variant="brand">
                      SSL
                    </Chip>
                    <Chip value={"tls"} variant="brand">
                      TLS
                    </Chip>

                    <Chip value={"starttls"} variant="brand">
                      STARTTLS
                    </Chip>
                  </FormChipGroup>
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
