import React from "react";
import DatabaseHelpCard from "metabase/containers/DatabaseHelpCard";
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
    <DatabaseHelpRoot isVisible={isVisible}>
      <DatabaseHelpCard />
    </DatabaseHelpRoot>
  );
};

export default DatabaseHelp;
