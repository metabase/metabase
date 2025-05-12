/* eslint-disable ttag/no-module-declaration -- see metabase#55045 */
import cx from "classnames";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";
import * as Yup from "yup";

import type { SettingElement } from "metabase/admin/settings/types";
import { UpsellHosting } from "metabase/admin/upsells";
import { useGetAdminSettingsDetailsQuery } from "metabase/api";
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
import { useDispatch, useSelector } from "metabase/lib/redux";
import { getIsEmailConfigured, getIsHosted } from "metabase/setup/selectors";
import { Box, Button, Flex, Group, Radio, Stack, Text } from "metabase/ui";
import type {
  EnterpriseSettingKey,
  SettingDefinition,
  SettingDefinitionMap,
  SettingKey,
  Settings,
} from "metabase-types/api";

import {
  clearEmailSettings,
  sendTestEmail,
  updateEmailSettings,
} from "../../settings";
import { SettingHeader } from "../SettingHeader";
import { SetByEnvVar } from "../widgets/AdminSettingInput";

const BREADCRUMBS = [[t`Email`, "/admin/settings/email"], [t`SMTP`]];

const SEND_TEST_BUTTON_STATES = {
  default: t`Send test email`,
  working: t`Sending...`,
  success: t`Sent!`,
};
type ButtonStateType = keyof typeof SEND_TEST_BUTTON_STATES;

export interface SMTPConnectionFormProps {
  elements: SettingElement[];
  settingValues: Settings;
}

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
  const [sendingEmail, setSendingEmail] = useState<ButtonStateType>("default");
  const [testEmailError, setTestEmailError] = useState<string | null>(null);

  const { data: settingsDetails } = useGetAdminSettingsDetailsQuery();

  const isHosted = useSelector(getIsHosted);
  const isEmailConfigured = useSelector(getIsEmailConfigured);
  const dispatch = useDispatch();

  const initialValues = useMemo<FormValueProps>(
    () => ({
      "email-smtp-host": settingsDetails?.["email-smtp-host"].value ?? null,
      "email-smtp-port": settingsDetails?.["email-smtp-port"].value ?? null,
      "email-smtp-security":
        settingsDetails?.["email-smtp-security"].value ?? "none",
      "email-smtp-username":
        settingsDetails?.["email-smtp-username"].value ?? "",
      "email-smtp-password":
        settingsDetails?.["email-smtp-password"].value ?? "",
    }),
    [settingsDetails],
  );

  const handleClearEmailSettings = useCallback(async () => {
    await dispatch(clearEmailSettings());
  }, [dispatch]);

  const handleUpdateEmailSettings = useCallback(
    async (formData: object) => {
      await dispatch(updateEmailSettings(formData));

      if (!isEmailConfigured) {
        dispatch(push("/admin/settings/email"));
      }
    },
    [dispatch, isEmailConfigured],
  );

  const handleSendTestEmail = useCallback(async () => {
    setSendingEmail("working");
    setTestEmailError(null);

    try {
      await dispatch(sendTestEmail());
      setSendingEmail("success");

      // show a confirmation for 3 seconds, then return to normal
      setTimeout(() => setSendingEmail("default"), 3000);
    } catch (error: any) {
      setSendingEmail("default");
      setTestEmailError(error?.data?.message);
    }
  }, [dispatch]);

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
              {isHosted && (
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
              {testEmailError && (
                <Text
                  role="alert"
                  aria-label={testEmailError}
                  color="error"
                  mb="1rem"
                >
                  {testEmailError}
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
                    {SEND_TEST_BUTTON_STATES[sendingEmail]}
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
