import { useMemo } from "react";
import { t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import type { CreateEmbeddingThemeRequest } from "metabase-types/api";

import { deriveSdkThemeSettings } from "../utils/derive-sdk-theme-settings";

/**
 * Returns the default `Light` and `Dark` embedding theme payloads, ready to be sent to the
 * `POST /api/embed-theme/seed-defaults` endpoint. Colors are derived from `METABASE_LIGHT_THEME`
 * / `METABASE_DARK_THEME` via `deriveFullMetabaseTheme`, with whitelabel overrides applied on top.
 */
export function useDefaultEmbeddingThemes(): CreateEmbeddingThemeRequest[] {
  const whitelabelColors = useSetting("application-colors");

  return useMemo(
    () => [
      {
        name: t`Light`,
        settings: deriveSdkThemeSettings("light", whitelabelColors ?? {}),
      },
      {
        name: t`Dark`,
        settings: deriveSdkThemeSettings("dark", whitelabelColors ?? {}),
      },
    ],
    [whitelabelColors],
  );
}
