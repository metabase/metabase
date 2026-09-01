import { NewExplorationEntry } from "../components/NewExplorationEntry";

import { useNewExplorationDraft } from "./NewExplorationDraftProvider";

export function NewExplorationPage() {
  const selection = useNewExplorationDraft();

  return <NewExplorationEntry selection={selection} />;
}
