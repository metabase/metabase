import type { TypedMutationTrigger } from "@reduxjs/toolkit/query/react";
import { useCallback, useMemo } from "react";
import { t } from "ttag";
import * as Yup from "yup";

import { isErrorWithMessage } from "metabase/admin/performance/utils";
import {
  useGetAdminSettingsDetailsQuery,
  useGetSettingsQuery,
} from "metabase/api";
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
import type { SettingDefinitionMap, SettingKey } from "metabase-types/api";

import { SetByEnvVarWrapper } from "../widgets/AdminSettingInput";

type GetFullFormKey = (
  shortFormKey: "port" | "host" | "username" | "security" | "password",
) => SettingKey;

interface BaseSMTPConnectionFormProps {
  onClose: () => void;
  secureMode?: boolean;
  updateMutation: TypedMutationTrigger<any, any, any>;
  deleteMutation: TypedMutationTrigger<any, void, any>;
  dataTestId: string;
  onTrackSuccess: () => void;
  getFullFormKey: GetFullFormKey;
}

const anySchema = Yup.mixed().nullable().default(null);

const getFormValueSchema = (
  settingsDetails: SettingDefinitionMap | undefined,
  getFullFormKey: GetFullFormKey,
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
    [getFullFormKey("host")]: settingsDetails?.[getFullFormKey("host")]
      ?.is_env_setting
      ? anySchema
      : Yup.string().required(Errors.required).default(""),
    [getFullFormKey("port")]: settingsDetails?.[getFullFormKey("port")]
      ?.is_env_setting
      ? anySchema
      : portSchema,
    [getFullFormKey("security")]: settingsDetails?.[getFullFormKey("security")]
      ?.is_env_setting
      ? anySchema
      : securitySchema,
    [getFullFormKey("username")]: settingsDetails?.[getFullFormKey("username")]
      ?.is_env_setting
      ? anySchema
      : Yup.string().default(""),
    [getFullFormKey("password")]: settingsDetails?.[getFullFormKey("password")]
      ?.is_env_setting
      ? anySchema
      : Yup.string().default(""),
  });
};

export const BaseSMTPConnectionForm = ({
  onClose,
  secureMode,
  updateMutation,
  deleteMutation,
  dataTestId,
  onTrackSuccess,
  getFullFormKey,
}: BaseSMTPConnectionFormProps) => {
  const [sendToast] = useToast();
  const { data: settingValues } = useGetSettingsQuery();
  const { data: settingsDetails } = useGetAdminSettingsDetailsQuery();

  const initialValues = useMemo(
    () => ({
      [getFullFormKey("host")]: settingValues?.[getFullFormKey("host")] ?? "",
      [getFullFormKey("port")]:
        settingValues?.[getFullFormKey("port")]?.toString() ??
        (secureMode ? "465" : null),
      [getFullFormKey("security")]:
        settingValues?.[getFullFormKey("security")] ??
        (secureMode ? "ssl" : "none"),
      [getFullFormKey("username")]:
        settingValues?.[getFullFormKey("username")] ?? "",
      [getFullFormKey("password")]:
        settingValues?.[getFullFormKey("password")] ?? "",
    }),
    [getFullFormKey, settingValues, secureMode],
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
        await updateMutation({
          ...formData,
          [getFullFormKey("port")]: parseInt(formData[getFullFormKey("port")]),
        }).unwrap();
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

        // If error doesn't have the expected structure, throw as-is
        throw error;
      }
    },
    [updateMutation, getFullFormKey, onTrackSuccess, sendToast, onClose],
  );

  const allSetByEnvVars = useMemo(() => {
    return (
      settingsDetails &&
      (["host", "port", "security", "username", "password"] as const)
        .map((formKey) => getFullFormKey(formKey))
        .every(
          (field) =>
            settingsDetails[field as keyof typeof settingsDetails]
              ?.is_env_setting,
        )
    );
  }, [getFullFormKey, settingsDetails]);

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
          validationSchema={getFormValueSchema(
            settingsDetails,
            getFullFormKey,
            secureMode,
          )}
          onSubmit={handleUpdateEmailSettings}
          enableReinitialize
        >
          {({ dirty, isValid, isSubmitting }) => (
            <Form>
              <Stack gap="lg">
                <SetByEnvVarWrapper
                  settingKey={getFullFormKey("host")}
                  settingDetails={settingsDetails?.[getFullFormKey("host")]}
                >
                  <FormTextInput
                    name={getFullFormKey("host")}
                    label={t`SMTP Host`}
                    description={
                      settingsDetails?.[getFullFormKey("host")]?.description
                    }
                    placeholder={"smtp.yourservice.com"}
                  />
                </SetByEnvVarWrapper>

                <SetByEnvVarWrapper
                  settingKey={getFullFormKey("port")}
                  settingDetails={settingsDetails?.[getFullFormKey("port")]}
                >
                  {secureMode ? (
                    <FormChipGroup
                      name={getFullFormKey("port")}
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
                      name={getFullFormKey("port")}
                      label={t`SMTP Port`}
                      placeholder={"587"}
                    />
                  )}
                </SetByEnvVarWrapper>

                <SetByEnvVarWrapper
                  settingKey={getFullFormKey("security")}
                  settingDetails={settingsDetails?.[getFullFormKey("security")]}
                >
                  <FormChipGroup
                    name={getFullFormKey("security")}
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
                  settingKey={getFullFormKey("username")}
                  settingDetails={settingsDetails?.[getFullFormKey("username")]}
                >
                  <FormTextInput
                    name={getFullFormKey("username")}
                    label={t`SMTP Username`}
                    placeholder={"nicetoseeyou"}
                  />
                </SetByEnvVarWrapper>

                <SetByEnvVarWrapper
                  settingKey={getFullFormKey("password")}
                  settingDetails={settingsDetails?.[getFullFormKey("password")]}
                >
                  <FormTextInput
                    name={getFullFormKey("password")}
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
