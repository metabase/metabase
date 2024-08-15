import { useMemo } from "react";
import { P, isMatching } from "ts-pattern";
import { t } from "ttag";
import _ from "underscore";

import { AuthTabs } from "metabase/admin/settings/components/AuthTabs";
import SettingToggle from "metabase/admin/settings/components/widgets/SettingToggle";
import type { SettingElement } from "metabase/admin/settings/types";
import { useSetting } from "metabase/common/hooks";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { useModal } from "metabase/hooks/use-modal";
import {
  Box,
  Button,
  Divider,
  Flex,
  Stack,
  Text,
  TextInput,
} from "metabase/ui";
import {
  useGetScimTokenQuery,
  useRegenerateScimTokenMutation,
} from "metabase-enterprise/api";
import { hasAnySsoPremiumFeature } from "metabase-enterprise/settings";
import type { EnterpriseSettings } from "metabase-enterprise/settings/types";
import type { Settings, SettingValue } from "metabase-types/api";

import { CopyScimInput, getTextInputStyles } from "./ScimInputs";
import { ScimTextWarning } from "./ScimTextWarning";
import {
  UserProvisioningFirstEnabledModal,
  UserProvisioningRegenerateTokenModal,
} from "./UserProvisioningModals";

type UserProvisioningSettings = Pick<
  EnterpriseSettings,
  "scim-enabled" | "scim-base-url" | "send-new-sso-user-admin-email?"
>;

export type SettingValues = Partial<Settings>;

interface UserProvisioningProps {
  elements: SettingElement[];
  settingValues: UserProvisioningSettings &
    Pick<
      EnterpriseSettings,
      | "saml-user-provisioning-enabled?"
      | "google-auth-enabled"
      | "ldap-enabled"
      | "saml-enabled"
      | "jwt-enabled"
    >;
  onSubmit: (values: SettingValues) => void;
  updateSetting: (
    settingElement: SettingElement,
    newValue: SettingValue,
    options?: {
      onChanged?: () => void;
      onError?: (error: unknown, message: string) => void;
    },
  ) => Promise<void>;
}

// const isUnexpectedTokenError = isMatching({
const isNoErrorOrNotFoundError = isMatching(
  P.union(undefined, {
    status: 404,
  }),
);

export const UserProvisioning = ({
  settingValues,
  elements,
  updateSetting,
}: UserProvisioningProps) => {
  const maskedTokenRequest = useGetScimTokenQuery();
  const [regenerateToken, regenerateTokenReq] =
    useRegenerateScimTokenMutation();

  const isLoadingToken =
    maskedTokenRequest.isLoading || regenerateTokenReq.isLoading;

  const fields = useMemo(() => {
    return _.indexBy(elements, "key");
  }, [elements]);

  const isScimEnabled = !!settingValues["scim-enabled"];
  const isScimInitialized = !!maskedTokenRequest.data;

  // since the request to enable scim and create the first token are seperate requests, it's possible
  // that the token request failed or wasn't issued due to some interuption (network issue, instance down, etc.)
  // we can detect this case by seing the scim is enabled without any token after all requests for token have settled
  // this is later used to show an error message based on this token not being found + encourage the user to go through
  // the regenerate flow to get a new unmasked token
  const isScimIncorrectlyIniailized = Boolean(
    !isScimInitialized &&
      isScimEnabled &&
      !(isLoadingToken || maskedTokenRequest.isFetching),
  );

  const samlUserProvisioningEnabled = useSetting(
    "saml-user-provisioning-enabled?" as any,
  );
  const showSamlWarning = samlUserProvisioningEnabled && !isScimInitialized;

  const handleScimEnabledChange = async (enabled: boolean) => {
    await updateSetting(fields["scim-enabled"], enabled, {
      onChanged: async () => {
        if (enabled && !isScimInitialized) {
          await regenerateToken();
          firstEnabledModal.open();
        }
      },
    });
  };

  const scimTokenInputText = maskedTokenRequest.data?.masked_key ?? "";
  const scimTokenError = !isNoErrorOrNotFoundError(maskedTokenRequest.error)
    ? t`Error fetching SCIM token`
    : "";

  const isAdminNotificationInputVisisble =
    hasAnySsoPremiumFeature() &&
    (settingValues["google-auth-enabled"] ||
      settingValues["ldap-enabled"] ||
      settingValues["saml-enabled"] ||
      settingValues["jwt-enabled"]);

  const firstEnabledModal = useModal(false);
  const regenerateModal = useModal(false);

  return (
    <>
      <AuthTabs activeKey="user-provisioning" />

      <LoadingAndErrorWrapper
        loading={maskedTokenRequest.isLoading}
        error={scimTokenError}
      >
        <Stack pl="md" spacing="2.5rem">
          <Box maw="35rem">
            <div>
              <Stack spacing="2.5rem">
                <Stack spacing=".5rem">
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
                  <Box ml="-4px">
                    <SettingToggle
                      disabled={false}
                      hideLabel={false}
                      tooltip={``}
                      id="scim-enabled"
                      data-testid="scim-enabled"
                      setting={fields["scim-enabled"]}
                      onChange={handleScimEnabledChange}
                    />
                  </Box>
                </Stack>

                {(isScimInitialized || isScimIncorrectlyIniailized) && (
                  <Stack
                    spacing="2rem"
                    opacity={isScimEnabled ? 1 : 0.5}
                    style={{ pointerEvents: isScimEnabled ? "auto" : "none" }}
                  >
                    <CopyScimInput
                      label={t`SCIM endpoint URL`}
                      value={fields["scim-base-url"].value?.toString() || ""}
                    />

                    <Flex gap="sm">
                      <TextInput
                        label={t`SCIM token`}
                        value={scimTokenInputText}
                        readOnly
                        disabled
                        w="100%"
                        error={
                          isScimIncorrectlyIniailized &&
                          t`Token failed to generate, please regenerate one.`
                        }
                        styles={getTextInputStyles({
                          masked: true,
                          disabled: true,
                        })}
                      />
                      <Flex direction="column" justify="end">
                        <Button
                          disabled={isLoadingToken || !isScimEnabled}
                          variant="filled"
                          onClick={regenerateModal.open}
                        >
                          {regenerateTokenReq.isLoading
                            ? t`Regenerating...`
                            : t`Regenerate`}
                        </Button>
                      </Flex>
                    </Flex>
                  </Stack>
                )}
              </Stack>

              {isAdminNotificationInputVisisble && (
                <>
                  <Divider my="2.5rem" />

                  <Stack spacing=".5rem">
                    <Text
                      fz="1.25rem"
                      fw="bold"
                    >{t`Notify admins of new users provisioned from SSO`}</Text>
                    <Text>{t`Send an email to admins whenever someone signs into SSO for the first time.`}</Text>
                    <Box ml="-4px">
                      <SettingToggle
                        disabled={false}
                        hideLabel={false}
                        tooltip={``}
                        id="send-new-sso-user-admin-email?"
                        setting={fields["send-new-sso-user-admin-email?"]}
                        onChange={(value: boolean) =>
                          updateSetting(
                            fields["send-new-sso-user-admin-email?"],
                            value,
                          )
                        }
                      />
                    </Box>
                  </Stack>
                </>
              )}
            </div>
          </Box>
        </Stack>
      </LoadingAndErrorWrapper>

      <UserProvisioningFirstEnabledModal
        opened={firstEnabledModal.opened}
        onClose={firstEnabledModal.close}
        unmaskedScimToken={regenerateTokenReq.data?.unmasked_key ?? ""}
        scimBaseUrl={fields["scim-base-url"].value?.toString() || ""}
        scimError={regenerateTokenReq.error}
      />

      <UserProvisioningRegenerateTokenModal
        opened={regenerateModal.opened}
        onClose={regenerateModal.close}
      />
    </>
  );
};
