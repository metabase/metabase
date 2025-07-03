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
  useUpdateCloudEmailSMTPSettingsMutation,
} from "metabase/api/email";
import { getErrorMessage } from "metabase/api/utils";
import { useToast } from "metabase/common/hooks";
import {
  Form,
  FormChipGroup,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import * as Errors from "metabase/lib/errors";
import { Box, Button, Chip, Flex, Modal, Stack } from "metabase/ui";
import type {
  EmailSMTPSettingsOverride,
  SettingDefinitionMap,
} from "metabase-types/api";

import { SetByEnvVarWrapper } from "../widgets/AdminSettingInput";

import { trackSMTPSetupSuccess } from "./analytics";

const emailSettingKeys = [
  "email-smtp-host-override",
  "email-smtp-port-override",
  "email-smtp-security-override",
  "email-smtp-username-override",
  "email-smtp-password-override",
] as const;

const anySchema = Yup.mixed().nullable().default(null);

type FormValues = Omit<
  EmailSMTPSettingsOverride,
  "email-smtp-port-override"
> & {
  "email-smtp-port-override": string; // FormChip doesn't work well with integers
};

// we need to allow this form to be submitted even when we have removed certain inputs
// when they are set by env vars
const getFormValueSchema = (
  settingsDetails: SettingDefinitionMap | undefined,
) => {
  return Yup.object({
    "email-smtp-host-override": settingsDetails?.["email-smtp-host-override"]
      ?.is_env_setting
      ? anySchema
      : Yup.string().required(Errors.required).default(""),
    "email-smtp-port-override": settingsDetails?.["email-smtp-port-override"]
      ?.is_env_setting
      ? anySchema
      : Yup.string()
          .oneOf(["465", "587", "2525"], "Must be either 465, 587 or 2525")
          .nullable()
          // .required(Errors.required)
          .default("465"),
    "email-smtp-security-override": settingsDetails?.[
      "email-smtp-security-override"
    ]?.is_env_setting
      ? anySchema
      : Yup.string()
          .oneOf(
            ["ssl", "tls", "starttls"],
            "Must be either SSL, TLS or STARTTLS",
          )
          .nullable()
          // .required(Errors.required)
          .default("ssl"),
    "email-smtp-username-override": settingsDetails?.[
      "email-smtp-username-override"
    ]?.is_env_setting
      ? anySchema
      : Yup.string().default(""),
    "email-smtp-password-override": settingsDetails?.[
      "email-smtp-password-override"
    ]?.is_env_setting
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
  const [deleteCloudEmailSMTPSettings] =
    useDeleteCloudEmailSMTPSettingsMutation();
  const [sendToast] = useToast();
  const { data: settingValues } = useGetSettingsQuery();
  const { data: settingsDetails } = useGetAdminSettingsDetailsQuery();
  const initialValues = useMemo<FormValues>(
    () => ({
      "email-smtp-host-override":
        settingValues?.["email-smtp-host-override"] ?? "",
      "email-smtp-port-override": settingValues?.["email-smtp-port-override"]
        ? settingValues?.["email-smtp-port-override"] + ""
        : "465",
      "email-smtp-security-override":
        settingValues?.["email-smtp-security-override"] ?? "ssl",
      "email-smtp-username-override":
        settingValues?.["email-smtp-username-override"] ?? "",
      "email-smtp-password-override":
        settingValues?.["email-smtp-password-override"] ?? "",
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
        formData["email-smtp-port-override"],
      ) as EmailSMTPSettingsOverride["email-smtp-port-override"];

      try {
        await updateCloudEmailSMTPSettings({
          ...formData,
          "email-smtp-port-override": smtpPort,
        }).unwrap();
        trackSMTPSetupSuccess({ eventDetail: "cloud" });
        sendToast({
          message: t`Email settings updated`,
        });
        onClose();
      } catch (error) {
        sendToast({
          icon: "warning",
          toastColor: "error",
          message: getErrorMessage(error, t`Error updating email settings`),
        });

        // throw to allow the form to handle the error
        throw error;
      }
    },
    [updateCloudEmailSMTPSettings, sendToast, onClose],
  );

  const allSetByEnvVars = useMemo(() => {
    return (
      settingsDetails &&
      emailSettingKeys.every(
        (settingKey) => settingsDetails[settingKey]?.is_env_setting,
      )
    );
  }, [settingsDetails]);

  return (
    <Modal
      title={t`SMTP Configuration`}
      opened
      onClose={onClose}
      padding="xl"
      data-testid="smtp-override-connection-form"
    >
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
                  settingKey="email-smtp-host-override"
                  settingDetails={settingsDetails?.["email-smtp-host-override"]}
                >
                  <FormTextInput
                    name="email-smtp-host-override"
                    label={t`SMTP Host`}
                    description={
                      settingsDetails?.["email-smtp-host-override"]?.description
                    }
                    placeholder={"smtp.yourservice.com"}
                  />
                </SetByEnvVarWrapper>
                <SetByEnvVarWrapper
                  settingKey="email-smtp-port-override"
                  settingDetails={settingsDetails?.["email-smtp-port-override"]}
                >
                  <FormChipGroup
                    name="email-smtp-port-override"
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
                  settingKey="email-smtp-security-override"
                  settingDetails={
                    settingsDetails?.["email-smtp-security-override"]
                  }
                >
                  <FormChipGroup
                    name="email-smtp-security-override"
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
                  settingKey="email-smtp-username-override"
                  settingDetails={
                    settingsDetails?.["email-smtp-username-override"]
                  }
                >
                  <FormTextInput
                    name="email-smtp-username-override"
                    label={t`SMTP Username`}
                    placeholder={"nicetoseeyou"}
                  />
                </SetByEnvVarWrapper>
                <SetByEnvVarWrapper
                  settingKey="email-smtp-password-override"
                  settingDetails={
                    settingsDetails?.["email-smtp-password-override"]
                  }
                >
                  <FormTextInput
                    name="email-smtp-password-override"
                    type="password"
                    label={t`SMTP Password`}
                    placeholder={"Shhh..."}
                  />
                </SetByEnvVarWrapper>

                <Flex mt="1rem" gap="md" justify="end">
                  <Button
                    onClick={handleClearEmailSettings}
                    disabled={allSetByEnvVars || isSubmitting}
                  >
                    {t`Clear`}
                  </Button>
                  <FormSubmitButton
                    label={t`Save changes`}
                    disabled={!dirty || !isValid || isSubmitting}
                    loading={isSubmitting}
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
