import { t } from "ttag";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import Button from "metabase/core/components/Button";
import { ApiKeysApi } from "metabase/services";
import {
  CardBadge,
  CardDescription,
  CardHeader,
  CardRoot,
  CardTitle,
} from "./AuthCard/AuthCard.styled";

export const ApiKeysAuthCard = () => {
  const [keyCount, setKeyCount] = useState(0);

  useEffect(() => {
    ApiKeysApi.count().then(setKeyCount);
  }, []);

  const isConfigured = keyCount > 0;
  return (
    <CardRoot>
      <CardHeader>
        <CardTitle>{t`API Keys`}</CardTitle>
        {isConfigured && (
          <CardBadge isEnabled data-testid="card-badge">
            {keyCount === 1 ? t`1 API Key` : t`${keyCount} API Keys`}
          </CardBadge>
        )}
      </CardHeader>
      <CardDescription>{t`Allow users to use the API keys to authenticate their API calls.`}</CardDescription>
      <Button as={Link} to={`/admin/settings/authentication/api-keys`}>
        {isConfigured ? t`Manage` : t`Set up`}
      </Button>
    </CardRoot>
  );
};
