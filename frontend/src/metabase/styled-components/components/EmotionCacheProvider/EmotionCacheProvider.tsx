import createCache from "@emotion/cache";
import { CacheProvider } from "@emotion/react";
import type { ReactNode } from "react";
import { useMemo } from "react";

import { isCypressActive } from "metabase/env";

interface EmotionCacheProviderProps {
  children?: ReactNode;
}

export const EmotionCacheProvider = ({
  children,
}: EmotionCacheProviderProps) => {
  const emotionCache = useMemo(() => {
    const cache = createCache({
      key: "emotion",
      nonce: window.MetabaseNonce,
      ...(isCypressActive && { speedy: true }),
    });
    // This disables :first-child not working in SSR warnings
    // Source: https://github.com/emotion-js/emotion/issues/1105#issuecomment-557726922
    cache.compat = true;
    return cache;
  }, []);

  return <CacheProvider value={emotionCache}>{children}</CacheProvider>;
};
