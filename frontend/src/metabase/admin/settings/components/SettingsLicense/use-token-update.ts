import { useCallback, useState } from "react";
import { t } from "ttag";
import { SettingsApi } from "metabase/services";
import { LICENSE_ACCEPTED_URL_HASH } from "../../constants";

export const useTokenUpdate = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const updateToken = useCallback(async (license: string) => {
    try {
      setIsLoading(true);
      await SettingsApi.put({
        key: "premium-embedding-token",
        value: license,
      });

      // In order to apply pro and enterprise features we need to perform a full reload
      window.location.href += LICENSE_ACCEPTED_URL_HASH;
      window.location.reload();
    } catch {
      setError(
        t`This token doesn't seem to be valid. Double-check it, then contact support if you think it should be working.`,
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    updateToken,
    isLoading,
    error,
  };
};
