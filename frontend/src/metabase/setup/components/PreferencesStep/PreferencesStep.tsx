import React from "react";
import { t } from "ttag";
import InactiveStep from "../InvactiveStep";
import ActiveStep from "../ActiveStep";

interface Props {
  isTrackingAllowed: boolean;
  isActive: boolean;
  isCompleted: boolean;
  onSelectThisStep: () => void;
  onSelectNextStep: () => void;
}

const PreferencesStep = ({
  isTrackingAllowed,
  isActive,
  isCompleted,
  onSelectThisStep,
  onSelectNextStep,
}: Props): JSX.Element => {
  if (!isActive) {
    return (
      <InactiveStep
        title={getStepTitle(isTrackingAllowed, isCompleted)}
        label={4}
        isCompleted={isCompleted}
        onSelect={onSelectThisStep}
      />
    );
  }

  return (
    <ActiveStep title={getStepTitle(isTrackingAllowed, isCompleted)} label={4}>
      <div />
    </ActiveStep>
  );
};

const getStepTitle = (
  isTrackingAllowed: boolean,
  isCompleted: boolean,
): string => {
  if (!isCompleted) {
    return t`Usage data preferences`;
  } else if (isTrackingAllowed) {
    return t`Thanks for helping us improve`;
  } else {
    return t`We won't collect any usage events`;
  }
};

export default PreferencesStep;
