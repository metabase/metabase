import { useCallback, useEffect, useState } from "react";
import { t } from "ttag";

import { reload } from "metabase/lib/dom";
import { SettingsApi, StoreApi } from "metabase/services";
import type { TokenStatus } from "metabase-types/api";

export const LICENSE_ACCEPTED_URL_HASH = "#activated";

// eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
const INVALID_TOKEN_ERROR = t`This token doesn't seem to be valid. Double-check it, then contact support if you think it should be working.`;
// eslint-disable-next-line ttag/no-module-declaration, metabase/no-literal-metabase-strings
const UNABLE_TO_VALIDATE_TOKEN = t`We're having trouble validating your token. Please double-check that your instance can connect to Metabase's servers.`;

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
      reload();
    } catch {
      setError(INVALID_TOKEN_ERROR);
    } finally {
      setIsUpdating(false);
    }
  }, []);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        setTokenStatus((await StoreApi.tokenStatus()) as TokenStatus);
      } catch (e) {
        const error = e as { status?: number };
        if (error.status !== 404) {
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
