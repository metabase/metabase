import { useDisclosure } from "@mantine/hooks";
import { P, isMatching } from "ts-pattern";
import { t } from "ttag";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import {
  AdminSettingInput,
  BasicAdminSettingInput,
} from "metabase/admin/settings/components/widgets/AdminSettingInput";
import {
  useGetAdminSettingsDetailsQuery,
  useGetSettingsQuery,
  useUpdateSettingMutation,
} from "metabase/api";
import { NotFound } from "metabase/common/components/ErrorPages";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { SetByEnvVar } from "metabase/common/components/SetByEnvVar";
import { useHasTokenFeature, useSetting } from "metabase/common/hooks";
import {
  Alert,
  Box,
  Button,
  Divider,
  Flex,
  Icon,
  Stack,
  Text,
  TextInput,
} from "metabase/ui";
import {
  useGetScimTokenQuery,
  useRegenerateScimTokenMutation,
} from "metabase-enterprise/api";
import {
  useHasAnySsoFeature,
  useHasSsoEnabled,
} from "metabase-enterprise/auth/utils";
import type { Settings } from "metabase-types/api";

import { CopyScimInput, getTextInputStyles } from "./ScimInputs";
import { ScimTextWarning } from "./ScimTextWarning";
import {
  UserProvisioningFirstEnabledModal,
  UserProvisioningRegenerateTokenModal,
} from "./UserProvisioningModals";

export type SettingValues = Partial<Settings>;

// const isUnexpectedTokenError = isMatching({
const isNoErrorOrNotFoundError = isMatching(
  P.union(undefined, {
    status: 404,
  }),
);

export const UserProvisioning = () => {
  const { data: settingValues, isLoading: settingsLoading } =
    useGetSettingsQuery();
  const { data: fields, isLoading: detailsLoading } =
    useGetAdminSettingsDetailsQuery();
  const [updateSetting] = useUpdateSettingMutation();

  const maskedTokenRequest = useGetScimTokenQuery();
  const [regenerateToken, regenerateTokenReq] =
    useRegenerateScimTokenMutation();

  const hasAnySsoFeature = useHasAnySsoFeature();
  const hasSsoEnabled = useHasSsoEnabled();

  const isLoadingToken =
    maskedTokenRequest.isLoading || regenerateTokenReq.isLoading;

  const isScimEnabled = !!settingValues?.["scim-enabled"];
  const isScimInitialized = !!maskedTokenRequest.data;
  const scimEnabledSetting = fields?.["scim-enabled"];
  const isScimSetByEnv =
    !!scimEnabledSetting?.is_env_setting && !!scimEnabledSetting?.env_name;

  // SCIM can be enabled without a token existing — e.g. via config file or env var, or if the
  // token-generation request failed during a previous UI-based enablement. In any of those cases
  // we expose the SCIM configuration section so the user can generate a token themselves.
  const isScimEnabledWithoutToken = Boolean(
    !isScimInitialized &&
    isScimEnabled &&
    !(isLoadingToken || maskedTokenRequest.isFetching),
  );

  // A token-generation attempt was made and failed (vs. "no attempt yet"). Used to surface the
  // failure on the token input — both when no token existed yet (Generate failed) and when a token
  // exists but regeneration failed.
  const hasTokenGenerationError = Boolean(
    regenerateTokenReq.error && !regenerateTokenReq.isLoading,
  );

  const samlUserProvisioningEnabled = useSetting(
    "saml-user-provisioning-enabled?" as any,
  );
  const showSamlWarning = samlUserProvisioningEnabled && !isScimInitialized;

  const handleScimEnabledChange = async (enabled: boolean) => {
    const result = await updateSetting({
      key: "scim-enabled",
      value: enabled,
    });

    if (!result.error && enabled && !isScimInitialized) {
      const regenerateResult = await regenerateToken();
      if (!regenerateResult.error) {
        openFirstEnabledModal();
      }
    }
  };

  const handleGenerateToken = async () => {
    const result = await regenerateToken();
    if (!result.error) {
      openFirstEnabledModal();
    }
  };

  const scimTokenInputText = maskedTokenRequest.data?.masked_key ?? "";
  const scimTokenError = !isNoErrorOrNotFoundError(maskedTokenRequest.error)
    ? t`Error fetching SCIM token`
    : "";

  const isAdminNotificationInputVisisble = hasAnySsoFeature && hasSsoEnabled;

  const [
    showFirstEnabledModal,
    { open: openFirstEnabledModal, close: closeFirstEnabledModal },
  ] = useDisclosure(false);
  const [
    showRegenerateModal,
    { open: openRegenerateModal, close: closeRegenerateModal },
  ] = useDisclosure(false);

  const hasFeature = useHasTokenFeature("scim");

  if (!hasFeature) {
    return <NotFound />;
  }

  if (settingsLoading || detailsLoading) {
    return <LoadingAndErrorWrapper loading={true} />;
  }

  return (
    <SettingsPageWrapper title={t`User provisioning`}>
      <SettingsSection>
        <LoadingAndErrorWrapper
          loading={maskedTokenRequest.isLoading}
          error={scimTokenError}
        >
          <Stack pl="md" gap="lg" maw="35rem">
            <Stack gap="lg" mb="lg" data-testid="scim-enabled-setting">
              <Text
                fz="1.25rem"
                fw="bold"
              >{t`User provisioning via SCIM`}</Text>
              <Text lh="1.5rem">{t`When enabled, you can use the settings below to set up user access on your identity management system.`}</Text>
              {showSamlWarning && (
                <ScimTextWarning>
                  {t`When enabled, SAML user provisioning will be turned off in favor of SCIM.`}
                </ScimTextWarning>
              )}
              {isScimSetByEnv ? (
                <SetByEnvVar varName={scimEnabledSetting.env_name!} />
              ) : (
                <BasicAdminSettingInput
                  inputType="boolean"
                  name="scim-enabled"
                  value={!!settingValues?.["scim-enabled"]}
                  onChange={(newValue) => handleScimEnabledChange(!!newValue)}
                />
              )}
              {isScimEnabledWithoutToken && !hasTokenGenerationError && (
                <Alert
                  color="warning"
                  icon={<Icon name="warning" />}
                >{t`Generate a SCIM token below to complete the setup.`}</Alert>
              )}
            </Stack>

            {(isScimInitialized || isScimEnabledWithoutToken) && (
              <Stack
                gap="2rem"
                opacity={isScimEnabled ? 1 : 0.5}
                style={{ pointerEvents: isScimEnabled ? "auto" : "none" }}
              >
                <CopyScimInput
                  label={t`SCIM endpoint URL`}
                  value={fields?.["scim-base-url"]?.value?.toString() || ""}
                />

                <Flex gap="sm" align="end">
                  <TextInput
                    label={t`SCIM token`}
                    value={scimTokenInputText}
                    readOnly
                    disabled
                    w="100%"
                    error={
                      hasTokenGenerationError &&
                      (isScimInitialized
                        ? t`Failed to regenerate token. Please try again.`
                        : t`Token failed to generate, Please try again.`)
                    }
                    styles={getTextInputStyles({
                      masked: true,
                      disabled: true,
                    })}
                    inputContainer={(children) => (
                      <Flex gap="sm">
                        <Box style={{ flexGrow: 1 }}>{children}</Box>
                        <Button
                          disabled={isLoadingToken || !isScimEnabled}
                          variant="filled"
                          onClick={
                            isScimInitialized
                              ? openRegenerateModal
                              : handleGenerateToken
                          }
                          style={{ flexShrink: 0 }}
                        >
                          {regenerateTokenReq.isLoading
                            ? t`Generating...`
                            : isScimInitialized
                              ? t`Regenerate`
                              : hasTokenGenerationError
                                ? t`Retry`
                                : t`Generate`}
                        </Button>
                      </Flex>
                    )}
                  />
                </Flex>
              </Stack>
            )}

            {isAdminNotificationInputVisisble && (
              <>
                <Divider my="lg" />
                <AdminSettingInput
                  name="send-new-sso-user-admin-email?"
                  title={t`Notify admins of new users provisioned from SSO`}
                  description={t`Send an email to admins whenever someone signs into SSO for the first time.`}
                  inputType="boolean"
                />
              </>
            )}
          </Stack>
        </LoadingAndErrorWrapper>

        <UserProvisioningFirstEnabledModal
          opened={showFirstEnabledModal}
          onClose={closeFirstEnabledModal}
          unmaskedScimToken={regenerateTokenReq.data?.unmasked_key ?? ""}
          scimBaseUrl={fields?.["scim-base-url"]?.value?.toString() || ""}
          scimError={regenerateTokenReq.error}
        />

        <UserProvisioningRegenerateTokenModal
          opened={showRegenerateModal}
          onClose={closeRegenerateModal}
          regenerateToken={regenerateToken}
          regenerateTokenReq={regenerateTokenReq}
        />
      </SettingsSection>
    </SettingsPageWrapper>
  );
};
