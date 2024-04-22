import cx from "classnames";
import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";
import _ from "underscore";

import type { SettingElement } from "metabase/admin/settings/types";
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
import { useDispatch, useSelector } from "metabase/lib/redux";
import { getIsPaidPlan } from "metabase/selectors/settings";
import { getIsEmailConfigured, getIsHosted } from "metabase/setup/selectors";
import { Group, Radio, Stack, Button } from "metabase/ui";
import type { Settings } from "metabase-types/api";

import {
  sendTestEmail,
  updateEmailSettings,
  clearEmailSettings,
} from "../../settings";
import MarginHostingCTA from "../widgets/MarginHostingCTA";

const BREADCRUMBS = [[t`Email`, "/admin/settings/email"], [t`SMTP`]];

const SEND_TEST_BUTTON_STATES = {
  default: t`Send test email`,
  working: t`Sending...`,
  success: t`Sent!`,
};
type ButtonStateType = keyof typeof SEND_TEST_BUTTON_STATES;

interface FormRefType {
  handleFormErrors: (error: Error) => void;
  setFormErrors: (formErrors: any) => void;
  setState: ({ formData, dirty }: { formData: object; dirty: boolean }) => void;
}

interface SMTPConnectionFormProps {
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

export const SMTPConnectionForm = ({
  elements,
  settingValues,
}: SMTPConnectionFormProps) => {
  const [sendingEmail, setSendingEmail] = useState<ButtonStateType>("default");

  const formRef = useRef<FormRefType>();
  const isHosted = useSelector(getIsHosted);
  const isPaidPlan = useSelector(getIsPaidPlan);
  const isEmailConfigured = useSelector(getIsEmailConfigured);
  const dispatch = useDispatch();

  const elementMap = useMemo(() => _.indexBy(elements, "key"), [elements]);

  const initialValues = useMemo<FormValueProps>(
    () => ({
      "email-smtp-host": settingValues["email-smtp-host"],
      "email-smtp-port": settingValues["email-smtp-port"],
      "email-smtp-security": settingValues["email-smtp-security"] || "none",
      "email-smtp-username": settingValues["email-smtp-username"],
      "email-smtp-password": settingValues["email-smtp-password"],
    }),
    [settingValues],
  );

  const handleClearEmailSettings = useCallback(async () => {
    await dispatch(clearEmailSettings());
  }, [dispatch]);

  const handleUpdateEmailSettings = useCallback(
    async formData => {
      await dispatch(updateEmailSettings(formData));

      if (!isEmailConfigured) {
        dispatch(push("/admin/settings/email"));
      }
    },
    [dispatch, isEmailConfigured],
  );

  const handleSendTestEmail = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();

      setSendingEmail("working");
      // NOTE: reaching into form component is not ideal
      formRef.current?.setFormErrors(null);

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
        // NOTE: reaching into form component is not ideal
        formRef.current?.setFormErrors(
          formRef.current?.handleFormErrors(error),
        );
      }
    },
    [dispatch],
  );

  useEffect(() => {
    if (isHosted) {
      dispatch(push("/admin/settings/email"));
    }
  }, [dispatch, isHosted]);

  return (
    <Stack spacing="sm" maw={400}>
      {isEmailConfigured && (
        <Breadcrumbs crumbs={BREADCRUMBS} className={cx(CS.ml2, CS.mb3)} />
      )}
      <FormProvider
        initialValues={initialValues}
        onSubmit={handleUpdateEmailSettings}
        enableReinitialize
      >
        {({ dirty, isValid, isSubmitting }) => (
          <Form>
            <FormTextInput
              name="email-smtp-host"
              label={elementMap["email-smtp-host"]["display_name"]}
              description={elementMap["email-smtp-host"]["description"]}
              placeholder={elementMap["email-smtp-host"]["placeholder"]}
              mb="1.5rem"
            />
            <FormTextInput
              name="email-smtp-port"
              label={elementMap["email-smtp-port"]["display_name"]}
              description={elementMap["email-smtp-port"]["description"]}
              placeholder={elementMap["email-smtp-port"]["placeholder"]}
              mb="1.5rem"
            />
            <FormRadioGroup
              name="email-smtp-security"
              label={elementMap["email-smtp-security"]["display_name"]}
              description={elementMap["email-smtp-security"]["description"]}
              mb="1.5rem"
            >
              <Group>
                {Object.entries(
                  elementMap["email-smtp-security"].options || {},
                ).map(([value, name]) => (
                  <Radio value={value} label={name} key={value} />
                ))}
              </Group>
            </FormRadioGroup>
            <FormTextInput
              name="email-smtp-username"
              label={elementMap["email-smtp-username"]["display_name"]}
              description={elementMap["email-smtp-username"]["description"]}
              placeholder={elementMap["email-smtp-username"]["placeholder"]}
              mb="1.5rem"
            />
            <FormTextInput
              name="email-smtp-password"
              type="password"
              label={elementMap["email-smtp-password"]["display_name"]}
              description={elementMap["email-smtp-password"]["description"]}
              placeholder={elementMap["email-smtp-password"]["placeholder"]}
              mb="1.5rem"
            />

            <Button
              onClick={handleClearEmailSettings}
              mr="1.5rem"
            >{t`Clear`}</Button>
            {!dirty && isValid && !isSubmitting && (
              <Button onClick={handleSendTestEmail} mr="1.5rem">
                {SEND_TEST_BUTTON_STATES[sendingEmail]}
              </Button>
            )}
            <FormSubmitButton label={t`Save changes`} disabled={!dirty} />
          </Form>
        )}
      </FormProvider>

      {!isPaidPlan && (
        <MarginHostingCTA tagline={t`Have your email configured for you.`} />
      )}
    </Stack>
  );
};
