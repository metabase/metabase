import { NewExplorationPlan } from "../components/NewExplorationPlan";

import { useNewExplorationDraft } from "./NewExplorationDraftProvider";

export function NewExplorationPlanPage() {
  const selection = useNewExplorationDraft();

  return <NewExplorationPlan selection={selection} />;
}
