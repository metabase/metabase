import { useCallback } from "react";
import { t } from "ttag";

import { AuthCard } from "metabase/admin/settings/auth/components/AuthCard";
import { useAdminSetting } from "metabase/api/utils";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useHasTokenFeature } from "metabase/common/hooks";
import {
  useDeleteOidcProviderMutation,
  useGetOidcProvidersQuery,
  useUpdateOidcProviderMutation,
} from "metabase-enterprise/api";

export function OidcAuthCard() {
  const {
    value: isConfigured,
    settingDetails,
    isLoading,
  } = useAdminSetting("oidc-configured");
  const { value: isEnabled } = useAdminSetting("oidc-enabled");
  const { data: providers } = useGetOidcProvidersQuery();
  const [updateProvider] = useUpdateOidcProviderMutation();
  const [deleteProvider] = useDeleteOidcProviderMutation();

  const hasFeature = useHasTokenFeature("sso_oidc");

  const handleToggle = useCallback(
    (enabled: boolean) => {
      if (providers && providers.length > 0) {
        updateProvider({
          slug: providers[0].name,
          provider: { enabled },
        });
      }
    },
    [providers, updateProvider],
  );

  const handleDeactivate = useCallback(() => {
    if (providers) {
      return Promise.all(providers.map((p) => deleteProvider(p.name).unwrap()));
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
