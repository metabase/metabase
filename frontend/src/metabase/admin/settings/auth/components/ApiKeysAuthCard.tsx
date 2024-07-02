import { t } from "ttag";

import { useCountApiKeysQuery } from "metabase/api";

import { AuthCardBody } from "./AuthCard/AuthCard";

export const ApiKeysAuthCard = () => {
  const { data } = useCountApiKeysQuery();
  const keyCount = data ?? 0;
  const isConfigured = keyCount > 0;

  return (
    <AuthCardBody
      type="api-keys"
      title={t`API Keys`}
      description={t`Create keys to authenticate API calls.`}
      isConfigured={isConfigured}
      isEnabled
      badgeText={keyCount === 1 ? t`1 API Key` : t`${keyCount} API Keys`}
      buttonText={isConfigured ? t`Manage` : t`Set up`}
    />
  );
};
