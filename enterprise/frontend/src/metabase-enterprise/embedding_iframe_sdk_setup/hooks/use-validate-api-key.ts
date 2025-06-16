import { useDebouncedCallback } from "@mantine/hooks";
import { useCallback, useEffect, useState } from "react";
import { t } from "ttag";

import { useSetting } from "metabase/common/hooks";

export function useValidateApiKey(apiKey?: string) {
  const instanceUrl = useSetting("site-url");

  const [error, setError] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  const validateApiKey = useCallback(
    async (key: string) => {
      setError(null);
      setIsValidating(true);

      try {
        const response = await fetch(`${instanceUrl}/api/user/current`, {
          headers: { "X-Api-Key": key },
          credentials: "omit",
        });

        setIsValidating(false);

        if (!response.ok) {
          setError(
            response.status === 401
              ? t`Invalid API key`
              : t`Cannot validate the API key`,
          );
        }
      } catch (error) {
        setIsValidating(false);
        setError(t`Cannot validate the API key`);
      }
    },
    [instanceUrl],
  );

  const debouncedValidate = useDebouncedCallback(validateApiKey, 500);

  useEffect(() => {
    if (apiKey && apiKey.trim()) {
      debouncedValidate(apiKey);
    } else {
      setError(null);
      setIsValidating(false);
    }
  }, [apiKey, debouncedValidate]);

  return { error, isValidating };
}
