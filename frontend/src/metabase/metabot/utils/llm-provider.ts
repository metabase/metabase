import type { LlmProviderTypeName } from "metabase-types/api";

import { LLM_PROVIDER_LOGOS } from "../constants";

export const getLlmProviderLogo = (
  type: LlmProviderTypeName,
): string | undefined => {
  const logo = LLM_PROVIDER_LOGOS[type];
  return logo ? `app/assets/img/llm-providers/${logo}` : undefined;
};
