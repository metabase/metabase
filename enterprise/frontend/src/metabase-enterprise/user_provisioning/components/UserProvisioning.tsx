import { useMemo } from "react";
import { P, isMatching, match } from "ts-pattern";
import { t } from "ttag";
import _ from "underscore";

import { AuthTabs } from "metabase/admin/settings/components/AuthTabs";
import SettingToggle from "metabase/admin/settings/components/widgets/SettingToggle";
import type { SettingElement } from "metabase/admin/settings/types";
import {
  Box,
  Button,
  Divider,
  Flex,
  Icon,
  Stack,
  TextInput,
} from "metabase/ui";
import {
  useGetScimTokenQuery,
  useRegenerateScimTokenMutation,
} from "metabase-enterprise/api";
import { hasAnySsoPremiumFeature } from "metabase-enterprise/settings";
import type { EnterpriseSettings } from "metabase-enterprise/settings/types";
import type { Settings, SettingValue } from "metabase-types/api";

import { CopyScimInput, textInputStyles } from "./ScimInputs";
import {
  UserProvisioningFirstEnabledModal,
  UserProvisioningRegenerateTokenModal,
} from "./UserProvisioningModals";
import { useModal } from "./utils";

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
  ) => Promise<void>;
}

const isErrorWithStatus = isMatching({
  status: P.number,
});

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

  const isScimInitialized =
    !(
      isErrorWithStatus(maskedTokenRequest.error) &&
      maskedTokenRequest.error.status === 404
    ) && !!maskedTokenRequest.data;

  const samlUserProvisioningEnabled =
    settingValues["saml-user-provisioning-enabled?"];
  const showSamlWarning =
    samlUserProvisioningEnabled && (!isScimInitialized || !isScimEnabled);

  const scimTokenInputText = match(maskedTokenRequest)
    .with({ isUninitialized: true }, () => t`Loading...`)
    .with({ isLoading: true }, () => t`Loading...`)
    .with(
      { isError: true },
      { error: P.not(P.nullish) },
      () => t`Error loading token...`,
    )
    .with({ data: P.not(undefined) }, ({ data }) => data.masked_key)
    .exhaustive();

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
      <Stack pl="md" spacing="xl">
        <Box maw="35rem">
          <div>
            <Stack spacing="xl">
              <Box>
                <h3>{t`User provisioning via SCIM`}</h3>
                <p>{t`When enabled, you can use the settings below to set up user access on your identity management system.`}</p>
                {showSamlWarning && (
                  <p>
                    <Icon name="info_filled" />{" "}
                    {t`When enabled, SAML user provisioning will be turned off in favor of SCIM.`}
                  </p>
                )}
                <SettingToggle
                  disabled={false}
                  hideLabel={false}
                  tooltip={``}
                  id="scim-enabled"
                  setting={fields["scim-enabled"]}
                  onChange={async (value: boolean) => {
                    await updateSetting(fields["scim-enabled"], value);
                    if (!isScimInitialized) {
                      await regenerateToken();
                      firstEnabledModal.open();
                    }
                  }}
                />
              </Box>

              {isScimInitialized && (
                <Stack
                  spacing="xl"
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
                      styles={textInputStyles}
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

                <h3>{t`Notify admins of new users provisioned from SSO`}</h3>
                <p>{t`Send an email to admins whenever someone signs into SSO for the first time.`}</p>
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
              </>
            )}
          </div>
        </Box>
      </Stack>

      <UserProvisioningFirstEnabledModal
        opened={firstEnabledModal.opened}
        onClose={firstEnabledModal.close}
        unmaskedScimToken={regenerateTokenReq.data?.unmasked_key ?? ""}
        scimBaseUrl={fields["scim-base-url"].value?.toString() || ""}
      />

      <UserProvisioningRegenerateTokenModal
        opened={regenerateModal.opened}
        onClose={regenerateModal.close}
      />
    </>
  );
};
