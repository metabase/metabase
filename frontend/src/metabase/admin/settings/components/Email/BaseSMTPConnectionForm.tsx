import type { TypedMutationTrigger } from "@reduxjs/toolkit/query/react";
import { type ReactNode, useCallback, useMemo } from "react";
import { t } from "ttag";
import * as Yup from "yup";

import { isErrorWithMessage } from "metabase/admin/performance/utils";
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

import { SettingHeader } from "../SettingHeader";
import { SetByEnvVar } from "../widgets/AdminSettingInput";

interface SettingDetails {
  is_env_setting?: boolean;
  env_name?: string;
  description?: string | ReactNode | null;
  display_name?: string;
}

interface BaseSMTPConnectionFormProps {
  onClose: () => void;
  settingValues: {
    host: string | null;
    port: number | string | null;
    security: string | null;
    username: string | null;
    password: string | null;
  };
  settingsDetails: {
    host?: SettingDetails;
    port?: SettingDetails;
    security?: SettingDetails;
    username?: SettingDetails;
    password?: SettingDetails;
  };
  secureMode?: boolean;
  updateMutation: TypedMutationTrigger<any, any, any>;
  deleteMutation: TypedMutationTrigger<any, void, any>;
  dataTestId: string;
  onTrackSuccess: () => void;
}

const anySchema = Yup.mixed().nullable().default(null);

const getFormValueSchema = (
  settingsDetails: BaseSMTPConnectionFormProps["settingsDetails"],
  secureMode?: boolean,
) => {
  const portSchema = secureMode
    ? Yup.string()
        .oneOf(["465", "587", "2525"], "Must be either 465, 587 or 2525")
        .nullable()
        .default("465")
    : Yup.number()
        .positive()
        .nullable()
        .required(Errors.required)
        .default(null);

  const securitySchema = secureMode
    ? Yup.string()
        .oneOf(
          ["ssl", "tls", "starttls"],
          "Must be either SSL, TLS or STARTTLS",
        )
        .nullable()
        .default("ssl")
    : Yup.string().default("none");

  return Yup.object({
    host: settingsDetails?.host?.is_env_setting
      ? anySchema
      : Yup.string().required(Errors.required).default(""),
    port: settingsDetails?.port?.is_env_setting ? anySchema : portSchema,
    security: settingsDetails?.security?.is_env_setting
      ? anySchema
      : securitySchema,
    username: settingsDetails?.username?.is_env_setting
      ? anySchema
      : Yup.string().default(""),
    password: settingsDetails?.password?.is_env_setting
      ? anySchema
      : Yup.string().default(""),
  });
};

export const BaseSMTPConnectionForm = ({
  onClose,
  settingValues,
  settingsDetails,
  secureMode,
  updateMutation,
  deleteMutation,
  dataTestId,
  onTrackSuccess,
}: BaseSMTPConnectionFormProps) => {
  const [sendToast] = useToast();

  const initialValues = useMemo(
    () => ({
      host: settingValues?.host ?? "",
      port: settingValues?.port ?? (secureMode ? "465" : null),
      security: settingValues?.security ?? (secureMode ? "ssl" : "none"),
      username: settingValues?.username ?? "",
      password: settingValues?.password ?? "",
    }),
    [settingValues, secureMode],
  );

  const handleClearEmailSettings = useCallback(async () => {
    const result = await deleteMutation();
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
  }, [deleteMutation, sendToast]);

  const handleUpdateEmailSettings = useCallback(
    async (formData: any) => {
      try {
        await updateMutation(formData).unwrap();
        onTrackSuccess();
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
    [updateMutation, onTrackSuccess, sendToast, onClose],
  );

  const allSetByEnvVars = useMemo(() => {
    return (
      settingsDetails &&
      ["host", "port", "security", "username", "password"].every(
        (field) =>
          settingsDetails[field as keyof typeof settingsDetails]
            ?.is_env_setting,
      )
    );
  }, [settingsDetails]);

  const securityOptions = useMemo(() => {
    const options = [
      { value: "ssl", label: "SSL" },
      { value: "tls", label: "TLS" },
      { value: "starttls", label: "STARTTLS" },
    ];

    if (!secureMode) {
      options.unshift({ value: "none", label: "None" });
    }

    return options;
  }, [secureMode]);

  return (
    <Modal
      title={t`SMTP Configuration`}
      opened
      onClose={onClose}
      padding="xl"
      data-testid={dataTestId}
    >
      <Box data-testid="settings-updates" pt="lg">
        <FormProvider
          initialValues={initialValues}
          validationSchema={getFormValueSchema(settingsDetails, secureMode)}
          onSubmit={handleUpdateEmailSettings}
          enableReinitialize
        >
          {({ dirty, isValid, isSubmitting }) => (
            <Form>
              <Stack gap="lg">
                <SetByEnvVarWrapper
                  settingKey="host"
                  settingDetails={settingsDetails?.host}
                >
                  <FormTextInput
                    name="host"
                    label={t`SMTP Host`}
                    description={settingsDetails?.host?.description}
                    placeholder={"smtp.yourservice.com"}
                  />
                </SetByEnvVarWrapper>

                <SetByEnvVarWrapper
                  settingKey="port"
                  settingDetails={settingsDetails?.port}
                >
                  {secureMode ? (
                    <FormChipGroup
                      name="port"
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
                  ) : (
                    <FormTextInput
                      name="port"
                      label={t`SMTP Port`}
                      placeholder={"587"}
                    />
                  )}
                </SetByEnvVarWrapper>

                <SetByEnvVarWrapper
                  settingKey="security"
                  settingDetails={settingsDetails?.security}
                >
                  <FormChipGroup
                    name="security"
                    label={t`SMTP Security`}
                    groupProps={{ mt: "0.5rem" }}
                  >
                    {securityOptions.map(({ value, label }) => (
                      <Chip key={value} value={value} variant="brand">
                        {label}
                      </Chip>
                    ))}
                  </FormChipGroup>
                </SetByEnvVarWrapper>

                <SetByEnvVarWrapper
                  settingKey="username"
                  settingDetails={settingsDetails?.username}
                >
                  <FormTextInput
                    name="username"
                    label={t`SMTP Username`}
                    placeholder={"nicetoseeyou"}
                  />
                </SetByEnvVarWrapper>

                <SetByEnvVarWrapper
                  settingKey="password"
                  settingDetails={settingsDetails?.password}
                >
                  <FormTextInput
                    name="password"
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

function SetByEnvVarWrapper({
  settingKey,
  settingDetails,
  children,
}: {
  settingKey: string;
  settingDetails: SettingDetails | undefined;
  children: React.ReactNode;
}) {
  if (
    settingDetails &&
    settingDetails?.is_env_setting &&
    settingDetails?.env_name
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
  return <div>{children}</div>;
}
