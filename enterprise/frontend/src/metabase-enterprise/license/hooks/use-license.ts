import { SettingsApi } from "metabase/services";
import { useCallback, useEffect, useState } from "react";
import { t } from "ttag";
import { StoreApi } from "../services";

export const LICENSE_ACCEPTED_URL_HASH = "#activated";

const INVALID_TOKEN_ERROR = t`This token doesn't seem to be valid. Double-check it, then contact support if you think it should be working.`;
const UNABLE_TO_VALIDATE_TOKEN = t`We're having trouble validating your token. Please double-check that your instance can connect to Metabase's servers.`;

export type LicenseStatus = "unlicensed" | "active" | "expired";

export const useLicense = (onActivated: () => void) => {
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [status, setStatus] = useState<LicenseStatus>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (window.location.hash === LICENSE_ACCEPTED_URL_HASH) {
      history.pushState("", document.title, window.location.pathname);
      onActivated();
    }
  }, [onActivated]);

  const updateToken = useCallback(async (license: string) => {
    try {
      setError(undefined);
      setIsUpdating(true);
      await SettingsApi.put({
        key: "premium-embedding-token",
        value: license,
      });

      // In order to apply pro and enterprise features we need to perform a full reload
      window.location.href += LICENSE_ACCEPTED_URL_HASH;
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
        const { valid } = await StoreApi.tokenStatus();
        setStatus(valid ? "active" : "expired");
      } catch (e) {
        if ((e as any).status === 404) {
          setStatus("unlicensed");
        } else {
          setError(UNABLE_TO_VALIDATE_TOKEN);
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchStatus();
  }, []);

  return {
    isUpdating,
    error,
    status,
    isLoading,
    updateToken,
  };
};
