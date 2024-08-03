import cx from "classnames";
import { useCallback, useEffect, useState, useMemo } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";
import _ from "underscore";
import * as Yup from "yup";

import type { SettingElement } from "metabase/admin/settings/types";
import { UpsellHosting } from "metabase/admin/upsells";
import Breadcrumbs from "metabase/components/Breadcrumbs";
import CS from "metabase/css/core/index.css";
import {
  FormProvider,
  Form,
  FormTextInput,
  FormRadioGroup,
  FormSubmitButton,
} from "metabase/forms";
import * as MetabaseAnalytics from "metabase/lib/analytics";
import { color } from "metabase/lib/colors";
import * as Errors from "metabase/lib/errors";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { getIsEmailConfigured, getIsHosted } from "metabase/setup/selectors";
import { Group, Radio, Stack, Button, Text, Flex, Box } from "metabase/ui";
import type { Settings } from "metabase-types/api";

import {
  sendTestEmail,
  updateEmailSettings,
  clearEmailSettings,
} from "../../settings";
import { SetByEnvVarWrapper } from "../SettingsSetting";

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
const getFormValueSchema = (elementMap: _.Dictionary<SettingElement>) => {
  return Yup.object({
    "email-smtp-host": elementMap["email-smtp-host"].is_env_setting
      ? anySchema
      : Yup.string().required(Errors.required).default(""),
    "email-smtp-port": elementMap["email-smtp-port"].is_env_setting
      ? anySchema
      : Yup.number()
          .positive()
          .nullable()
          .required(Errors.required)
          .default(null),
    "email-smtp-security": elementMap["email-smtp-security"].is_env_setting
      ? anySchema
      : Yup.string().default("none"),
    "email-smtp-username": elementMap["email-smtp-username"].is_env_setting
      ? anySchema
      : Yup.string().default(""),
    "email-smtp-password": elementMap["email-smtp-password"].is_env_setting
      ? anySchema
      : Yup.string().default(""),
  });
};

export const SMTPConnectionForm = ({
  elements,
  settingValues,
}: SMTPConnectionFormProps) => {
  const [sendingEmail, setSendingEmail] = useState<ButtonStateType>("default");
  const [testEmailError, setTestEmailError] = useState<string | null>(null);

  const isHosted = useSelector(getIsHosted);
  const isEmailConfigured = useSelector(getIsEmailConfigured);
  const dispatch = useDispatch();

  const elementMap = useMemo(() => _.indexBy(elements, "key"), [elements]);

  const initialValues = useMemo<FormValueProps>(
    () => ({
      "email-smtp-host": settingValues["email-smtp-host"],
      "email-smtp-port": settingValues["email-smtp-port"],
      "email-smtp-security": settingValues["email-smtp-security"] ?? "none",
      "email-smtp-username": settingValues["email-smtp-username"] ?? "",
      "email-smtp-password": settingValues["email-smtp-password"] ?? "",
    }),
    [settingValues],
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
      MetabaseAnalytics.trackStructEvent(
        "Email Settings",
        "Test Email",
        "success",
      );

      // show a confirmation for 3 seconds, then return to normal
      setTimeout(() => setSendingEmail("default"), 3000);
    } catch (error: any) {
      MetabaseAnalytics.trackStructEvent(
        "Email Settings",
        "Test Email",
        "error",
      );
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
    return elements.every(element => element.is_env_setting);
  }, [elements]);

  return (
    <Flex justify="space-between">
      <Stack spacing="sm" maw={600} style={{ paddingInlineStart: "0.5rem" }}>
        {isEmailConfigured && (
          <Breadcrumbs crumbs={BREADCRUMBS} className={cx(CS.mb3)} />
        )}
        <FormProvider
          initialValues={initialValues}
          validationSchema={getFormValueSchema(elementMap)}
          onSubmit={handleUpdateEmailSettings}
          enableReinitialize
        >
          {({ dirty, isValid, isSubmitting, values }) => (
            <Form>
              <SetByEnvVarWrapper setting={elementMap["email-smtp-host"]}>
                <FormTextInput
                  name="email-smtp-host"
                  label={elementMap["email-smtp-host"]["display_name"]}
                  description={elementMap["email-smtp-host"]["description"]}
                  placeholder={elementMap["email-smtp-host"]["placeholder"]}
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
              <SetByEnvVarWrapper setting={elementMap["email-smtp-port"]}>
                <FormTextInput
                  name="email-smtp-port"
                  label={elementMap["email-smtp-port"]["display_name"]}
                  description={elementMap["email-smtp-port"]["description"]}
                  placeholder={elementMap["email-smtp-port"]["placeholder"]}
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
              <SetByEnvVarWrapper setting={elementMap["email-smtp-security"]}>
                <FormRadioGroup
                  name="email-smtp-security"
                  label={elementMap["email-smtp-security"]["display_name"]}
                  description={elementMap["email-smtp-security"]["description"]}
                  mb="1.5rem"
                  labelProps={{
                    tt: "uppercase",
                    fz: "0.875rem",
                    c: "text-medium",
                    mb: "0.5rem",
                  }}
                >
                  <Group>
                    {elementMap["email-smtp-security"].options?.map(
                      ({ value, name }) => (
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
                      ),
                    )}
                  </Group>
                </FormRadioGroup>
              </SetByEnvVarWrapper>
              <SetByEnvVarWrapper setting={elementMap["email-smtp-username"]}>
                <FormTextInput
                  name="email-smtp-username"
                  label={elementMap["email-smtp-username"]["display_name"]}
                  description={elementMap["email-smtp-username"]["description"]}
                  placeholder={elementMap["email-smtp-username"]["placeholder"]}
                  mb="1.5rem"
                  labelProps={{
                    tt: "uppercase",
                    mb: "0.5rem",
                  }}
                />
              </SetByEnvVarWrapper>
              <SetByEnvVarWrapper setting={elementMap["email-smtp-password"]}>
                <FormTextInput
                  name="email-smtp-password"
                  type="password"
                  label={elementMap["email-smtp-password"]["display_name"]}
                  description={elementMap["email-smtp-password"]["description"]}
                  placeholder={elementMap["email-smtp-password"]["placeholder"]}
                  mb="1.5rem"
                  labelProps={{
                    tt: "uppercase",
                    mb: "0.5rem",
                  }}
                />
              </SetByEnvVarWrapper>
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
