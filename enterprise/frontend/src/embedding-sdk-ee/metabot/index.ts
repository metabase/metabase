// Contains side effects that puts `MetabotQuestion` and `useMetabot` in the plugin
import "./MetabotQuestion";
import "./hooks/use-metabot";

import { METABOT_SDK_EE_PLUGIN } from "embedding-sdk-bundle/components/public/MetabotQuestion/MetabotQuestion";
import { MetabotProvider } from "metabase/metabot/context";

METABOT_SDK_EE_PLUGIN.MetabotProvider = MetabotProvider;

// the types are in the OSS code, but we're re-exporting them here for convenience to not have to import from two places
export type { MetabotQuestionProps } from "embedding-sdk-bundle/components/public/MetabotQuestion/types";
