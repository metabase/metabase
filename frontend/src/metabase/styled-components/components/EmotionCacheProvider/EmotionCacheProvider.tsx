import createCache from "@emotion/cache";
// eslint-disable-next-line no-restricted-imports
import { CacheProvider } from "@emotion/react";
import type { ReactNode } from "react";
import { useMemo } from "react";

import { isCypressActive } from "metabase/env";

interface EmotionCacheProviderProps {
  cacheKey?: string;
  container?: HTMLElement | null;
  children?: ReactNode;
}

export const EmotionCacheProvider = ({
  cacheKey,
  container,
  children,
}: EmotionCacheProviderProps) => {
  const emotionCache = useMemo(() => {
    const cache = createCache({
      key: cacheKey ?? "emotion",
      container: container as Node,
      nonce: window.MetabaseNonce,
      ...(isCypressActive && { speedy: true }),
    });
    // This disables :first-child not working in SSR warnings
    // Source: https://github.com/emotion-js/emotion/issues/1105#issuecomment-557726922
    cache.compat = true;
    return cache;
  }, [cacheKey, container]);

  return <CacheProvider value={emotionCache}>{children}</CacheProvider>;
};
