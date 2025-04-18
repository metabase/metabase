import { useMemo } from "react";

import type { MetabaseTheme } from "embedding-sdk";
import type {
  EmbedResource,
  EmbedResourceType,
} from "metabase/public/lib/types";

export type SdkInteractiveEmbedSettings = {
  embedResourceType: EmbedResourceType;
  embedResourceId?: EmbedResource["id"];

  theme?: MetabaseTheme;
};

export function useSdkInteractiveEmbedSettings(
  settingsKey: string,
): SdkInteractiveEmbedSettings | null {
  return useMemo(() => {
    const decodedSettings =
      decodeBase64Json<SdkInteractiveEmbedSettings>(settingsKey);

    return decodedSettings;
  }, [settingsKey]);
}

function decodeBase64Json<T>(encodedString: string): T | null {
  const jsonString = atob(encodedString);

  try {
    const jsonObject = JSON.parse(jsonString);

    return jsonObject;
  } catch (error) {
    return null;
  }
}
