import React from "react";
import { t } from "ttag";
import ActiveStep from "../ActiveStep";
import InactiveStep from "../InvactiveStep";
import { DatabaseInfo } from "../../types";

interface Props {
  database?: DatabaseInfo;
  isActive: boolean;
  isCompleted: boolean;
  onChangeDatabase: (datasbase: DatabaseInfo) => void;
  onSelectThisStep: () => void;
  onSelectNextStep: () => void;
}

const DatabaseStep = ({
  database,
  isActive,
  isCompleted,
  onChangeDatabase,
  onSelectThisStep,
  onSelectNextStep,
}: Props) => {
  if (!isActive) {
    return (
      <InactiveStep
        title={getStepTitle(database, isCompleted)}
        label={3}
        isCompleted={isCompleted}
        onSelect={onSelectThisStep}
      />
    );
  }

  return (
    <ActiveStep title={getStepTitle(database, isCompleted)} label={3}>
      <div />
    </ActiveStep>
  );
};

const getStepTitle = (
  database: DatabaseInfo | undefined,
  isCompleted: boolean,
) => {
  if (!isCompleted) {
    return t`Add your data`;
  } else if (database) {
    return t`Connecting to ${database.name}`;
  } else {
    return t`I'll add my own data later`;
  }
};

export default DatabaseStep;
