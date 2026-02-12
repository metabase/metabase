import { useCallback } from "react";
import { t } from "ttag";

import { AuthCard } from "metabase/admin/settings/auth/components/AuthCard";
import { useAdminSetting } from "metabase/api/utils";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useHasTokenFeature } from "metabase/common/hooks";
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

  const handleToggle = useCallback(
    (enabled: boolean) => {
      if (providers && providers.length > 0) {
        updateProvider({
          key: providers[0].key,
          provider: { enabled },
        }).unwrap();
      }
    },
    [providers, updateProvider],
  );

  const handleDeactivate = useCallback(() => {
    if (providers) {
      return Promise.all(providers.map((p) => deleteProvider(p.key).unwrap()));
    }
    return Promise.resolve();
  }, [providers, deleteProvider]);

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
      setting={settingDetails as any}
    />
  );
}
