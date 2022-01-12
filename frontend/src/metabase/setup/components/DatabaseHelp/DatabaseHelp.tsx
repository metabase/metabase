import React from "react";
import DatabaseHelpCard from "metabase/components/DatabaseHelpCard";
import { DatabaseHelpRoot } from "./DatabaseHelp.styled";

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
      <DatabaseHelpCard engine={engine} />
    </DatabaseHelpRoot>
  );
};

export default DatabaseHelp;
