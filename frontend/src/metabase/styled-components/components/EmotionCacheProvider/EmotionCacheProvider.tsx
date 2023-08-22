import type { ReactNode } from "react";
import { useMemo } from "react";
import createCache from "@emotion/cache";
import { CacheProvider } from "@emotion/react";

interface EmotionCacheProviderProps {
  children?: ReactNode;
}

export const EmotionCacheProvider = ({
  children,
}: EmotionCacheProviderProps) => {
  const emotionCache = useMemo(
    () => createCache({ key: "emotion", nonce: window.MetabaseNonce }),
    [],
  );

  return <CacheProvider value={emotionCache}>{children}</CacheProvider>;
};
