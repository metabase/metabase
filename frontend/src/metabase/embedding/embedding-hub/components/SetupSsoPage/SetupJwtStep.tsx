/* eslint-disable metabase/no-literal-metabase-strings */
import { useCallback, useEffect, useState } from "react";
import { t } from "ttag";

import { useUpdateSettingsMutation } from "metabase/api";
import { useSetting, useToast } from "metabase/common/hooks";
import { UtilApi } from "metabase/services";
import { Button, Group, Stack, Text, TextInput } from "metabase/ui";

export const SetupJwtStep = ({ onSuccess }: { onSuccess: () => void }) => {
  const [sendToast] = useToast();
  const [updateSettings, { isLoading }] = useUpdateSettingsMutation();

  const existingJwtIdentityProviderUri = useSetting(
    "jwt-identity-provider-uri",
  );

  const [jwtIdentityProviderUri, setJwtIdentityProviderUri] = useState("");

  // Initialize with existing IdP URL if available
  useEffect(() => {
    if (existingJwtIdentityProviderUri) {
      setJwtIdentityProviderUri(existingJwtIdentityProviderUri);
    }
  }, [existingJwtIdentityProviderUri]);

  const handleEnableJwt = useCallback(async () => {
    try {
      const { token } = await UtilApi.random_token();

      await updateSettings({
        "jwt-identity-provider-uri": jwtIdentityProviderUri.trim(),
        "jwt-shared-secret": token,
        "jwt-enabled": true,
        "jwt-group-sync": true,
      }).unwrap();

      onSuccess();
    } catch (error) {
      sendToast({
        icon: "warning",
        toastColor: "error",
        message: t`Failed to enable JWT authentication`,
      });
    }
  }, [jwtIdentityProviderUri, updateSettings, sendToast, onSuccess]);

  return (
    <Stack gap="lg">
      <Text size="md" c="text-secondary" lh="lg">
        {t`You can connect Metabase to your identity provider using JSON Web Tokens (JWT) to authenticate people. Enabling JWT authentication will also create a signing key and enable group sync.`}
      </Text>

      <TextInput
        label={t`JWT Identity Provider URI`}
        description={t`This is where Metabase will redirect login requests`}
        placeholder="https://jwt.yourdomain.org"
        value={jwtIdentityProviderUri}
        onChange={(e) => setJwtIdentityProviderUri(e.target.value)}
        required
      />

      <Group justify="flex-end">
        <Button
          variant="filled"
          onClick={handleEnableJwt}
          loading={isLoading}
          disabled={!jwtIdentityProviderUri.trim()}
        >
          {t`Enable JWT authentication and continue`}
        </Button>
      </Group>
    </Stack>
  );
};
