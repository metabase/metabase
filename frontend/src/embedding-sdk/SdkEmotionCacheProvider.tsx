import type { ReactNode } from "react";
import { useMemo } from "react";
import createCache from "@emotion/cache";
import { CacheProvider } from "@emotion/react";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore -- there are no types for this library
import createExtraScopePlugin from "stylis-plugin-extra-scope";

import { SDK_CONTEXT_CLASS_NAME } from "./config";

interface EmotionCacheProviderProps {
  children?: ReactNode;
}

export const SdkEmotionCacheProvider = ({
  children,
}: EmotionCacheProviderProps) => {
  const emotionCache = useMemo(() => {
    const cache = createCache({
      key: "emotion",
      nonce: window.MetabaseNonce,
      stylisPlugins: [createExtraScopePlugin(`#${SDK_CONTEXT_CLASS_NAME}`)],
    });
    // This disables :first-child not working in SSR warnings
    // Source: https://github.com/emotion-js/emotion/issues/1105#issuecomment-557726922
    cache.compat = true;
    return cache;
  }, []);

  return <CacheProvider value={emotionCache}>{children}</CacheProvider>;
};
