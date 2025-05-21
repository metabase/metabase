/* eslint-disable ttag/no-module-declaration -- see metabase#55045 */
import cx from "classnames";
import type React from "react";
import { useCallback, useEffect, useMemo } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";
import * as Yup from "yup";

import { UpsellHosting } from "metabase/admin/upsells";
import {
  useGetAdminSettingsDetailsQuery,
  useGetSettingsQuery,
} from "metabase/api";
import {
  useSendTestEmailMutation,
  useUpdateEmailSMTPSettingsMutation,
} from "metabase/api/email";
import { useSetting } from "metabase/common/hooks";
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
  EnterpriseSettingKey,
  SettingDefinition,
  SettingDefinitionMap,
  SettingKey,
  Settings,
} from "metabase-types/api";

import { clearEmailSettings } from "../../settings";
import { SettingHeader } from "../SettingHeader";
import { SetByEnvVar } from "../widgets/AdminSettingInput";

const BREADCRUMBS = [[t`Email`, "/admin/settings/email"], [t`SMTP`]];

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
  // const [deleteEmailSMTPSettings, deleteEmailSMTPSettingsResult] = useDeleteEmailSMTPSettingsMutation();
  const { data: settingValues } = useGetSettingsQuery();
  const { data: settingsDetails } = useGetAdminSettingsDetailsQuery();
  const isHosted = useSetting("is-hosted?");
  const isEmailConfigured = useSetting("email-configured?");
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
    await dispatch(clearEmailSettings());
  }, [dispatch]);

  const handleUpdateEmailSettings = useCallback(
    async (formData: EmailSMTPSettings) => {
      await updateEmailSMTPSettings(formData);

      if (!isEmailConfigured) {
        dispatch(push("/admin/settings/email"));
      }
    },
    [dispatch, isEmailConfigured, updateEmailSMTPSettings],
  );

  // const handleSendTestEmail = useCallback(async () => {
  //   setSendingEmail("working");
  //   setTestEmailError(null);

  //   try {
  //     await dispatch(sendTestEmail());
  //     setSendingEmail("success");

  //     // show a confirmation for 3 seconds, then return to normal
  //     setTimeout(() => setSendingEmail("default"), 3000);
  //   } catch (error: any) {
  //     setSendingEmail("default");
  //     setTestEmailError(error?.data?.message);
  //   }
  // }, [dispatch]);

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
    <Flex justify="space-between">
      <Stack gap="sm" maw={600} style={{ paddingInlineStart: "0.5rem" }}>
        {isEmailConfigured && (
          <Breadcrumbs crumbs={BREADCRUMBS} className={cx(CS.mb3)} />
        )}
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

              {(sendTestEmailResult.error as Errors.GenericErrorResponse) && (
                <Text
                  role="alert"
                  // aria-label={ sendTestEmailResult.error}
                  color="error"
                  mb="1rem"
                >
                  Hi
                </Text>
              )}
              <Flex mt="1rem" gap="1.5rem">
                <FormSubmitButton
                  label={t`Save changes`}
                  disabled={!dirty || !isValid || isSubmitting}
                  variant="filled"
                />
                {!dirty && isValid && !isSubmitting && (
                  <Button onClick={() => sendTestEmail()}>
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

type SetByEnvVarWrapperProps<S extends EnterpriseSettingKey> = {
  settingKey: S;
  settingDetails: SettingDefinition<S> | undefined;
  children: React.ReactNode;
};

function SetByEnvVarWrapper<SettingName extends SettingKey>({
  settingKey,
  settingDetails,
  children,
}: SetByEnvVarWrapperProps<SettingName>) {
  if (
    settingDetails &&
    settingDetails.is_env_setting &&
    settingDetails.env_name
  ) {
    return (
      <Box mb="lg">
        <SettingHeader
          id={settingKey}
          title={settingDetails.display_name}
          description={settingDetails.description}
        />
        <SetByEnvVar varName={settingDetails.env_name} />
      </Box>
    );
  }
  return children;
}
