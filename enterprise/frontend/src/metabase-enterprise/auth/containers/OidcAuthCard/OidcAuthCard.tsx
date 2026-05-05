import { useCallback } from "react";
import { t } from "ttag";

import { AuthCard } from "metabase/admin/settings/auth/components/AuthCard";
import { useAdminSetting } from "metabase/api/utils";
import { getErrorMessage } from "metabase/api/utils/errors";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useHasTokenFeature, useToast } from "metabase/common/hooks";
import {
  useDeleteCustomOidcMutation,
  useGetCustomOidcProvidersQuery,
  useUpdateCustomOidcMutation,
} from "metabase-enterprise/api";

export function OidcAuthCard() {
  const {
    value: isConfigured,
    settingDetails,
    isLoading,
  } = useAdminSetting("oidc-configured");
  const { value: isEnabled } = useAdminSetting("oidc-enabled");
  const { data: providers } = useGetCustomOidcProvidersQuery();
  const [updateProvider] = useUpdateCustomOidcMutation();
  const [deleteProvider] = useDeleteCustomOidcMutation();

  const hasFeature = useHasTokenFeature("sso_oidc");
  const [sendToast] = useToast();

  const handleToggle = useCallback(
    async (enabled: boolean) => {
      try {
        if (providers && providers.length > 0) {
          await updateProvider({
            key: providers[0].key,
            provider: { enabled },
          }).unwrap();
        }
      } catch (error) {
        sendToast({
          message: getErrorMessage(error, t`Failed to update OIDC provider`),
          icon: "warning",
        });
      }
    },
    [providers, updateProvider, sendToast],
  );

  const handleDeactivate = useCallback(async () => {
    try {
      if (providers) {
        await Promise.all(providers.map((p) => deleteProvider(p.key).unwrap()));
      }
    } catch (error) {
      sendToast({
        message: getErrorMessage(error, t`Failed to deactivate OIDC provider`),
        icon: "warning",
      });
    }
  }, [providers, deleteProvider, sendToast]);

  if (!hasFeature) {
    return null;
  }

  if (isLoading) {
    return <LoadingAndErrorWrapper loading />;
  }

  return (
    <AuthCard
      type="oidc"
      name={t`OIDC`}
      description={t`Allows users to login via an OpenID Connect Identity Provider.`}
      isConfigured={!!isConfigured}
      isEnabled={!!isEnabled}
      onChange={handleToggle}
      onDeactivate={handleDeactivate}
      setting={settingDetails}
    />
  );
}
