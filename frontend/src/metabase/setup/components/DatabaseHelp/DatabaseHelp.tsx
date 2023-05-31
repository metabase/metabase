import React from "react";
import { useSelector } from "metabase/lib/redux";
import DatabaseHelpCard from "metabase/databases/containers/DatabaseHelpCard";
import { DATABASE_STEP } from "../../constants";
import { getDatabaseEngine, getIsStepActive } from "../../selectors";
import { SetupCardContainer } from "../SetupCardContainer";

export const DatabaseHelp = (): JSX.Element => {
  const engine = useSelector(getDatabaseEngine);
  const isStepActive = useSelector(state =>
    getIsStepActive(state, DATABASE_STEP),
  );
  const isVisible = isStepActive && engine != null;

  return (
    <SetupCardContainer isVisible={isVisible}>
      <DatabaseHelpCard />
    </SetupCardContainer>
  );
};
