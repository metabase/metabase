import { METABOT_SDK_EE_PLUGIN } from "embedding-sdk-bundle/components/public/MetabotQuestion/MetabotQuestion";
import type { UseMetabotResult } from "embedding-sdk-bundle/types/metabot";

export const useMetabot = (): UseMetabotResult | null =>
  METABOT_SDK_EE_PLUGIN.useMetabot();
