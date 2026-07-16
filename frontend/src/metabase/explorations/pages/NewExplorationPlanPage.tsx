import type { Location } from "history";
import { useEffect } from "react";

import { useMetabotAgent } from "metabase/metabot/hooks";

import { EXPLORATIONS_AGENT_ID } from "../components/NewExplorationChat/NewExplorationChat";
import { NewExplorationPlan } from "../components/NewExplorationPlan";
import { useExplorationSelection } from "../hooks";

export function NewExplorationPlanPage(props: { location?: Location }) {
  return <NewExplorationPlanPageInner key={props.location?.key} />;
}

function NewExplorationPlanPageInner() {
  const selection = useExplorationSelection();

  const { resetConversation } = useMetabotAgent(EXPLORATIONS_AGENT_ID);

  useEffect(() => {
    resetConversation();
  }, [resetConversation]);

  return <NewExplorationPlan selection={selection} />;
}
