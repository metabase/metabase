import { useSelector } from "metabase/lib/redux";
import { DatabaseHelpCard } from "metabase/databases/components/DatabaseHelpCard";
import { DATABASE_STEP } from "../../constants";
import { getDatabaseEngine, getIsStepActive } from "../../selectors";
import { SetupHelpContainer } from "../SetupHelpContainer";

export const DatabaseHelp = (): JSX.Element => {
  const engine = useSelector(getDatabaseEngine);
  const isStepActive = useSelector(state =>
    getIsStepActive(state, DATABASE_STEP),
  );
  const isVisible = isStepActive && engine != null;

  return (
    <SetupHelpContainer isVisible={isVisible}>
      <DatabaseHelpCard />
    </SetupHelpContainer>
  );
};
