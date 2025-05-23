import cx from "classnames";
import { useCallback, useEffect, useMemo } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";
import * as Yup from "yup";

import { isErrorWithMessage } from "metabase/admin/performance/utils";
import { UpsellHosting } from "metabase/admin/upsells";
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
import Breadcrumbs from "metabase/components/Breadcrumbs";
import CS from "metabase/css/core/index.css";
import {
  Form,
  FormProvider,
  FormRadioGroup,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import { color } from "metabase/lib/colors";
import * as Errors from "metabase/lib/errors";
import { useDispatch } from "metabase/lib/redux";
import { Box, Button, Flex, Group, Radio, Stack, Text } from "metabase/ui";
import type {
  EmailSMTPSettings,
  SettingDefinitionMap,
  Settings,
} from "metabase-types/api";

import { SetByEnvVarWrapper } from "../widgets/AdminSettingInput";

const getBreadcrumbs = () => [[t`Email`, "/admin/settings/email"], [t`SMTP`]];

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
    "email-smtp-host": settingsDetails?.["email-smtp-host"].is_env_setting
      ? anySchema
      : Yup.string().required(Errors.required).default(""),
    "email-smtp-port": settingsDetails?.["email-smtp-port"].is_env_setting
      ? anySchema
      : Yup.number()
          .positive()
          .nullable()
          .required(Errors.required)
          .default(null),
    "email-smtp-security": settingsDetails?.["email-smtp-security"]
      .is_env_setting
      ? anySchema
      : Yup.string().default("none"),
    "email-smtp-username": settingsDetails?.["email-smtp-username"]
      .is_env_setting
      ? anySchema
      : Yup.string().default(""),
    "email-smtp-password": settingsDetails?.["email-smtp-password"]
      .is_env_setting
      ? anySchema
      : Yup.string().default(""),
  });
};

export const SMTPConnectionForm = () => {
  const [updateEmailSMTPSettings] = useUpdateEmailSMTPSettingsMutation();
  const [sendTestEmail, sendTestEmailResult] = useSendTestEmailMutation();
  const [deleteEmailSMTPSettings] = useDeleteEmailSMTPSettingsMutation();
  const [sendToast] = useToast();
  const { data: settingValues } = useGetSettingsQuery();
  const { data: settingsDetails } = useGetAdminSettingsDetailsQuery();
  const isHosted = useSetting("is-hosted?");
  const dispatch = useDispatch();
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
    await deleteEmailSMTPSettings();
  }, [deleteEmailSMTPSettings]);

  const handleUpdateEmailSettings = useCallback(
    async (formData: EmailSMTPSettings) => {
      try {
        await updateEmailSMTPSettings(formData).unwrap();
        sendToast({
          message: t`Email settings updated successfully!`,
          toastColor: "success",
        });
      } catch (error) {
        sendToast({
          icon: "warning",
          toastColor: "error",
          message: isErrorWithMessage(error)
            ? error.data.message
            : t`Error updating email settings`,
        });
      }
    },
    [updateEmailSMTPSettings, sendToast],
  );

  const handleSendTestEmail = useCallback(async () => {
    try {
      await sendTestEmail().unwrap();
      sendToast({
        message: t`Email sent successfully!`,
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

  useEffect(() => {
    if (isHosted) {
      dispatch(push("/admin/settings/email"));
    }
  }, [dispatch, isHosted]);

  const allSetByEnvVars = useMemo(() => {
    return (
      settingsDetails &&
      emailSettingKeys.every(
        (settingKey) => settingsDetails[settingKey].is_env_setting,
      )
    );
  }, [settingsDetails]);

  return (
    <Flex justify="space-between" pl="lg">
      <Stack gap="sm" w="25rem">
        <Breadcrumbs crumbs={getBreadcrumbs()} className={cx(CS.mb3)} />
        <FormProvider
          initialValues={initialValues}
          validationSchema={getFormValueSchema(settingsDetails)}
          onSubmit={handleUpdateEmailSettings}
          enableReinitialize
        >
          {({ dirty, isValid, isSubmitting, values }) => (
            <Form>
              <SetByEnvVarWrapper
                settingKey="email-smtp-host"
                settingDetails={settingsDetails?.["email-smtp-host"]}
              >
                <FormTextInput
                  name="email-smtp-host"
                  label={t`SMTP Host`}
                  description={settingsDetails?.["email-smtp-host"].description}
                  placeholder={"smtp.yourservice.com"}
                  mb="1.5rem"
                  labelProps={{
                    tt: "uppercase",
                    mb: "0.5rem",
                  }}
                  descriptionProps={{
                    fz: "0.75rem",
                    mb: "0.5rem",
                  }}
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
                  mb="1.5rem"
                  labelProps={{
                    tt: "uppercase",
                    mb: "0.5rem",
                  }}
                  descriptionProps={{
                    fz: "0.75rem",
                    mb: "0.5rem",
                  }}
                />
              </SetByEnvVarWrapper>
              <SetByEnvVarWrapper
                settingKey="email-smtp-security"
                settingDetails={settingsDetails?.["email-smtp-security"]}
              >
                <FormRadioGroup
                  name="email-smtp-security"
                  label={t`SMTP Security`}
                  mb="1.5rem"
                  labelProps={{
                    tt: "uppercase",
                    fz: "0.875rem",
                    c: "text-medium",
                    mb: "0.5rem",
                  }}
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
                  mb="1.5rem"
                  labelProps={{
                    tt: "uppercase",
                    mb: "0.5rem",
                  }}
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
                    mb="1.5rem"
                    labelProps={{
                      tt: "uppercase",
                      mb: "0.5rem",
                    }}
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
              <Flex mt="1rem" gap="1.5rem">
                <FormSubmitButton
                  label={t`Save changes`}
                  disabled={!dirty || !isValid || isSubmitting}
                  variant="filled"
                />
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
              </Flex>
            </Form>
          )}
        </FormProvider>
      </Stack>
      <Box>
        <UpsellHosting source="settings-email-migrate_to_cloud" />
      </Box>
    </Flex>
  );
};

function getTestEmailErrorMessage(error: unknown): string {
  return isErrorWithMessage(error)
    ? error.data.message
    : t`Error sending test email`;
}
