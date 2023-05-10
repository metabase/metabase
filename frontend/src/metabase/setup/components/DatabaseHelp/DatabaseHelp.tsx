import React from "react";
import DatabaseHelpCard from "metabase/databases/containers/DatabaseHelpCard";
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DatabaseHelp;
