import { useEffect, useState } from "react";

import type { MetabaseTheme } from "../theme";

export interface NamedTheme {
  id: number;
  name: string;
  settings: MetabaseTheme;
  created_at: string;
  updated_at: string;
}

export interface UseNamedThemeResult {
  theme: NamedTheme | null;
  isLoading: boolean;
  error: Error | null;
}

export function useNamedTheme(themeName: string | null): UseNamedThemeResult {
  const [theme, setTheme] = useState<NamedTheme | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!themeName) {
      setTheme(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    fetch(`/api/theme/v1/${encodeURIComponent(themeName)}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    })
      .then(response => {
        if (!response.ok) {
          throw new Error(
            `Failed to fetch theme "${themeName}": ${response.status} ${response.statusText}`,
          );
        }
        return response.json();
      })
      .then((data: NamedTheme) => {
        setTheme(data);
        setIsLoading(false);
      })
      .catch((err: Error) => {
        setError(err);
        setIsLoading(false);
        setTheme(null);
      });
  }, [themeName]);

  return { theme, isLoading, error };
}
