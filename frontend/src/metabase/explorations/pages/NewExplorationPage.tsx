import type { Location } from "history";
import { useEffect, useState } from "react";

import { useMetabotAgent } from "metabase/metabot/hooks";

import { EXPLORATIONS_AGENT_ID } from "../components/NewExplorationChat/NewExplorationChat";
import { NewExplorationEntry } from "../components/NewExplorationEntry";
import { NewExplorationPlan } from "../components/NewExplorationPlan";
import { useExplorationSelection } from "../hooks";
import type { NewExplorationMode } from "../types";

export function NewExplorationPage(props: { location?: Location }) {
  return <NewExplorationPageInner key={props.location?.key} />;
}

function NewExplorationPageInner() {
  const selection = useExplorationSelection();

  const [mode, setMode] = useState<NewExplorationMode>("entry");

  const { resetConversation } = useMetabotAgent(EXPLORATIONS_AGENT_ID);

  useEffect(() => {
    resetConversation();
  }, [resetConversation]);

  return mode === "entry" ? (
    <NewExplorationEntry selection={selection} setMode={setMode} />
  ) : (
    <NewExplorationPlan selection={selection} />
  );
}
