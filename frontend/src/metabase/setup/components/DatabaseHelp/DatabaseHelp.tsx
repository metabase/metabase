import React from "react";
import DatabaseHelpCard from "metabase/containers/DatabaseHelpCard";
import { SetupCardContainer } from "../SetupCardContainer";

export interface DatabaseHelpProps {
  engine?: string;
  isStepActive: boolean;
}

const DatabaseHelp = ({
  engine,
  isStepActive,
}: DatabaseHelpProps): JSX.Element => {
  const isVisible = isStepActive && engine != null;

  return (
    <SetupCardContainer isVisible={isVisible}>
      <DatabaseHelpCard />
    </SetupCardContainer>
  );
};

export default DatabaseHelp;
