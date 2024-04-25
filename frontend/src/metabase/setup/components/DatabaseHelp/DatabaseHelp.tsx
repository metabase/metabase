import { DatabaseHelpCard } from "metabase/databases/components/DatabaseHelpCard";
import { useSelector } from "metabase/lib/redux";

import { getDatabaseEngine, getIsStepActive } from "../../selectors";
import { SetupCardContainer } from "../SetupCardContainer";

export const DatabaseHelp = (): JSX.Element => {
  const engine = useSelector(getDatabaseEngine);
  const isStepActive = useSelector(state =>
    getIsStepActive(state, "db_connection"),
  );
  const isVisible = isStepActive && engine != null;

  return (
    <SetupCardContainer isVisible={isVisible}>
      <DatabaseHelpCard />
    </SetupCardContainer>
  );
};
