import type { MetabotQuestionProps } from "metabase/embed/sdk-bundle/types/metabot-question";
import { METABOT_SDK_EE_PLUGIN } from "metabase/plugins";

export const MetabotQuestion = (props: MetabotQuestionProps) => {
  return <METABOT_SDK_EE_PLUGIN.MetabotQuestion {...props} />;
};
