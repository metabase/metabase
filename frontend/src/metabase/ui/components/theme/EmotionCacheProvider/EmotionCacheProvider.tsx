// eslint-disable-next-line eslint-js/no-restricted-imports -- temporary until Emotion is removed from the app
import createCache from "@emotion/cache";
// eslint-disable-next-line eslint-js/no-restricted-imports
import { CacheProvider } from "@emotion/react";
import { getNonce } from "get-nonce";
import type { ReactNode } from "react";
import { useMemo } from "react";

// Same expression as `isCypressActive` in metabase/env, guarded for non-browser bundles.
const isCypressActive =
  typeof window !== "undefined" &&
  // @ts-expect-error window.Cypress is not typed
  !!window.Cypress;

interface EmotionCacheProviderProps {
  children?: ReactNode;
}

export const EmotionCacheProvider = ({
  children,
}: EmotionCacheProviderProps) => {
  const emotionCache = useMemo(() => {
    const cache = createCache({
      key: "emotion",
      nonce: getNonce(),
      ...(isCypressActive && { speedy: true }),
    });
    // This disables :first-child not working in SSR warnings
    // Source: https://github.com/emotion-js/emotion/issues/1105#issuecomment-557726922
    cache.compat = true;
    return cache;
  }, []);

  return <CacheProvider value={emotionCache}>{children}</CacheProvider>;
};
