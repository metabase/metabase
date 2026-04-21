// Contains side effects that puts `MetabotQuestion` in the plugin
import "./MetabotQuestion";

import { MetabotProvider } from "metabase/metabot/context";
import { METABOT_SDK_EE_PLUGIN } from "metabase/plugins";

METABOT_SDK_EE_PLUGIN.MetabotProvider = MetabotProvider;

// the types are in the OSS code, but we're re-exporting them here for convenience to not have to import from two places
export type { MetabotQuestionProps } from "metabase/embedding/sdk-bundle/types/metabot-question";
