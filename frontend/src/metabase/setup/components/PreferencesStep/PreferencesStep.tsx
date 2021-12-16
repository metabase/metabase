import React, { useState } from "react";
import { t, jt } from "ttag";
import Settings from "metabase/lib/settings";
import ActionButton from "metabase/components/ActionButton";
import ExternalLink from "metabase/components/ExternalLink";
import Toggle from "metabase/components/Toggle";
import InactiveStep from "../InvactiveStep";
import ActiveStep from "../ActiveStep";
import {
  StepDescription,
  StepToggle,
  StepToggleLabel,
  StepInfoList,
  StepError,
} from "./PreferencesStep.styled";
import { getIn } from "icepick";

interface Props {
  isTrackingAllowed: boolean;
  isActive: boolean;
  isCompleted: boolean;
  onChangeTracking: (isTrackingAllowed: boolean) => void;
  onSubmitSetup: () => void;
  onSelectThisStep: () => void;
  onSelectNextStep: () => void;
}

const PreferencesStep = ({
  isTrackingAllowed,
  isActive,
  isCompleted,
  onChangeTracking,
  onSubmitSetup,
  onSelectThisStep,
  onSelectNextStep,
}: Props): JSX.Element => {
  const [errorMessage, setErrorMessage] = useState<string>();

  const handleSubmit = async () => {
    try {
      await onSubmitSetup();
      onSelectNextStep();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    }
  };

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
      <StepToggle>
        <Toggle
          value={isTrackingAllowed}
          onChange={onChangeTracking}
          aria-labelledby="anonymous-usage-events-label"
        />
        <StepToggleLabel id="anonymous-usage-events-label">
          {t`Allow Metabase to anonymously collect usage events`}
        </StepToggleLabel>
      </StepToggle>
      {isTrackingAllowed && (
        <StepInfoList>
          <li>{jt`Metabase ${(
            <strong>{t`never`}</strong>
          )} collects anything about your data or question results.`}</li>
          <li>{t`All collection is completely anonymous.`}</li>
          <li>{t`Collection can be turned off at any point in your admin settings.`}</li>
        </StepInfoList>
      )}
      <ActionButton
        normalText={t`Next`}
        activeText={t`Next`}
        failedText={t`Failed`}
        successText={t`Success`}
        primary
        type="button"
        actionFn={handleSubmit}
      />
      {errorMessage && <StepError>{errorMessage}</StepError>}
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

const getErrorMessage = (error: unknown): string | undefined => {
  const message = getIn(error, ["data", "message"]);
  const errors = getIn(error, ["data", "errors"]);

  if (message) {
    return message;
  } else if (errors) {
    const [error] = Object.values(errors);
    return String(error);
  }
};

export default PreferencesStep;
