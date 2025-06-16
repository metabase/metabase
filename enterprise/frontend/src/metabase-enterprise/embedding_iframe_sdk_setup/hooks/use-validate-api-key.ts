import { useDebouncedCallback } from "@mantine/hooks";
import { useCallback, useEffect, useState } from "react";

import { useSetting } from "metabase/common/hooks";

export function useValidateApiKey(apiKey: string) {
  const instanceUrl = useSetting("site-url");

  const [error, setError] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  const validateApiKey = useCallback(async (key: string, url: string) => {
    if (!key || !key.trim()) {
      setError(null);
      setIsValidating(false);
      return;
    }

    setIsValidating(true);
    setError(null);

    try {
      const response = await fetch(`${url}/api/user/current`, {
        headers: { "X-Api-Key": key },
        credentials: "omit",
      });

      if (response.ok) {
        setIsValidating(false);
        setError(null);
      } else {
        setIsValidating(false);
        setError(
          response.status === 401
            ? "Invalid API key"
            : `Validating the API key failed`,
        );
      }
    } catch (error) {
      setIsValidating(false);
      setError(error instanceof Error ? error.message : "Network error");
    }
  }, []);

  // Debounced validation function - waits 500ms after user stops typing
  const debouncedValidate = useDebouncedCallback(validateApiKey, 500);

  useEffect(() => {
    if (apiKey && instanceUrl) {
      debouncedValidate(apiKey, instanceUrl);
    } else {
      setError(null);
      setIsValidating(false);
    }
  }, [apiKey, instanceUrl, debouncedValidate]);

  return { error, isValidating };
}
