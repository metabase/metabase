import { t } from "ttag";
import { useEffect, useState } from "react";
import { ApiKeysApi } from "metabase/services";

import { AuthCardBody } from "./AuthCard/AuthCard";

export const ApiKeysAuthCard = () => {
  const [keyCount, setKeyCount] = useState(0);

  useEffect(() => {
    ApiKeysApi.count().then(setKeyCount);
  }, []);

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
