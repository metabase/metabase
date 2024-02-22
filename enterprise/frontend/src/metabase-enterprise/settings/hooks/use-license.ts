import { useCallback, useEffect, useState } from "react";
import { t } from "ttag";

import { SettingsApi, StoreApi } from "metabase/services";

export const LICENSE_ACCEPTED_URL_HASH = "#activated";

const INVALID_TOKEN_ERROR = t`This token doesn't seem to be valid. Double-check it, then contact support if you think it should be working.`;
// eslint-disable-next-line no-literal-metabase-strings -- Metabase settings
const UNABLE_TO_VALIDATE_TOKEN = t`We're having trouble validating your token. Please double-check that your instance can connect to Metabase's servers.`;

export type TokenStatus = {
  validUntil: Date;
  isValid: boolean;
  isTrial: boolean;
  features: Set<string>;
  status: string;
};

export const useLicense = (onActivated?: () => void) => {
  const [tokenStatus, setTokenStatus] = useState<TokenStatus>();
  const [loading, setLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (window.location.hash === LICENSE_ACCEPTED_URL_HASH) {
      history.pushState("", document.title, window.location.pathname);
      onActivated?.();
    }
  }, [onActivated]);

  const updateToken = useCallback(async (token: string) => {
    try {
      setError(undefined);
      setIsUpdating(true);
      await SettingsApi.put({
        key: "premium-embedding-token",
        value: token,
      });

      // In order to apply pro and enterprise features we need to perform a full reload
      const isValidTokenAccepted = token.trim().length > 0;
      if (isValidTokenAccepted) {
        window.location.href += LICENSE_ACCEPTED_URL_HASH;
      }
      window.location.reload();
    } catch {
      setError(INVALID_TOKEN_ERROR);
    } finally {
      setIsUpdating(false);
    }
  }, []);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const response = await StoreApi.tokenStatus();
        setTokenStatus({
          validUntil: new Date(response["valid-thru"]),
          isValid: response.valid,
          isTrial: response.trial,
          features: new Set(response.features),
          status: response.status,
        });
      } catch (e) {
        if ((e as any).status !== 404) {
          setError(UNABLE_TO_VALIDATE_TOKEN);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchStatus();
  }, []);

  return {
    isUpdating,
    error,
    tokenStatus,
    loading,
    updateToken,
  };
};
