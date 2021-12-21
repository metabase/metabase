import React from "react";
import { DatabaseHelpRoot, DatabaseHelpCard } from "./DatabaseHelp.styled";

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
    <DatabaseHelpRoot
      isVisible={isVisible}
      data-testid="database-setup-help-card"
    >
      <DatabaseHelpCard {...{ engine, hasCircle: false }} />
    </DatabaseHelpRoot>
  );
};

export default DatabaseHelp;
