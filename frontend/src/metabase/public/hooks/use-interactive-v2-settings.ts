import { useMemo } from "react";

import type { MetabaseTheme } from "embedding-sdk"; // eslint-disable-line no-restricted-imports -- to fix after POC

import type { EmbedResource, EmbedResourceType } from "../lib/types";

export type InteractiveV2Settings = {
  embedResourceType: EmbedResourceType;
  embedResourceId: EmbedResource["id"];

  apiKey: string;
  theme?: MetabaseTheme;
};

export function useInteractiveV2Settings(
  settingsKey: string,
): InteractiveV2Settings | null {
  return useMemo(() => {
    const decodedSettings =
      decodeBase64Json<InteractiveV2Settings>(settingsKey);

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
