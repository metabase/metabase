import React from "react";
import { t } from "ttag";
import Settings from "metabase/lib/settings";
import ExternalLink from "metabase/components/ExternalLink";
import Toggle from "metabase/components/Toggle";
import InactiveStep from "../InvactiveStep";
import ActiveStep from "../ActiveStep";
import {
  StepDescription,
  StepToggleContainer,
  StepToggleLabel,
} from "./PreferencesStep.styled";

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
      <StepDescription>
        {t`In order to help us improve Metabase, we'd like to collect certain data about product usage.`}{" "}
        <ExternalLink
          href={Settings.docsUrl("information-collection")}
        >{t`Here's a full list of what we track and why.`}</ExternalLink>
      </StepDescription>
      <StepToggleContainer>
        <Toggle
          value={isTrackingAllowed}
          aria-labelledby="anonymous-usage-events-label"
        />
        <StepToggleLabel id="anonymous-usage-events-label">
          {t`Allow Metabase to anonymously collect usage events`}
        </StepToggleLabel>
      </StepToggleContainer>
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
