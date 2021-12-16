import React from "react";
import { DatabaseHelpRoot, DatabaseHelpCard } from "./DatabaseHelp.styled";

interface Props {
  engine?: string;
  isActive: boolean;
}

const DatabaseHelp = ({ engine, isActive }: Props): JSX.Element => {
  const isVisible = isActive && engine != null;

  return (
    <DatabaseHelpRoot isVisible={isVisible}>
      <DatabaseHelpCard {...{ engine, hasCircle: false }} />
    </DatabaseHelpRoot>
  );
};

export default DatabaseHelp;
