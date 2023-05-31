import { useState } from "react";
import { t, jt } from "ttag";
import { getIn } from "icepick";
import Settings from "metabase/lib/settings";
import ActionButton from "metabase/components/ActionButton";
import ExternalLink from "metabase/core/components/ExternalLink";
import ActiveStep from "../ActiveStep";
import InactiveStep from "../InvactiveStep";
import {
  StepDescription,
  StepToggleContainer,
  StepToggleLabel,
  StepInfoList,
  StepError,
  StepToggle,
} from "./PreferencesStep.styled";

export interface PreferencesStepProps {
  isTrackingAllowed: boolean;
  isStepActive: boolean;
  isStepCompleted: boolean;
  isSetupCompleted: boolean;
  onTrackingChange: (isTrackingAllowed: boolean) => void;
  onStepSelect: () => void;
  onStepSubmit: (isTrackingAllowed: boolean) => void;
}

const PreferencesStep = ({
  isTrackingAllowed,
  isStepActive,
  isStepCompleted,
  isSetupCompleted,
  onTrackingChange,
  onStepSelect,
  onStepSubmit,
}: PreferencesStepProps): JSX.Element => {
  const [errorMessage, setErrorMessage] = useState<string>();

  const handleSubmit = async () => {
    try {
      await onStepSubmit(isTrackingAllowed);
    } catch (error) {
      setErrorMessage(getSubmitError(error));
      throw error;
    }
  };

  if (!isStepActive) {
    return (
      <InactiveStep
        title={getStepTitle(isTrackingAllowed, isStepCompleted)}
        label={4}
        isStepCompleted={isStepCompleted}
        isSetupCompleted={isSetupCompleted}
        onStepSelect={onStepSelect}
      />
    );
  }

  return (
    <ActiveStep
      title={getStepTitle(isTrackingAllowed, isStepCompleted)}
      label={4}
    >
      <StepDescription>
        {t`In order to help us improve Metabase, we'd like to collect certain data about product usage.`}{" "}
        <ExternalLink
          href={Settings.docsUrl(
            "installation-and-operation/information-collection",
          )}
        >{t`Here's a full list of what we track and why.`}</ExternalLink>
      </StepDescription>
      <StepToggleContainer>
        <StepToggle
          value={isTrackingAllowed}
          autoFocus
          onChange={onTrackingChange}
          aria-labelledby="anonymous-usage-events-label"
        />
        <StepToggleLabel id="anonymous-usage-events-label">
          {t`Allow Metabase to anonymously collect usage events`}
        </StepToggleLabel>
      </StepToggleContainer>
      {isTrackingAllowed && (
        <StepInfoList>
          <li>{jt`Metabase ${(
            <strong key="message">{t`never`}</strong>
          )} collects anything about your data or question results.`}</li>
          <li>{t`All collection is completely anonymous.`}</li>
          <li>{t`Collection can be turned off at any point in your admin settings.`}</li>
        </StepInfoList>
      )}
      <ActionButton
        normalText={t`Finish`}
        activeText={t`Finishing…`}
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
  isStepCompleted: boolean,
): string => {
  if (!isStepCompleted) {
    return t`Usage data preferences`;
  } else if (isTrackingAllowed) {
    return t`Thanks for helping us improve`;
  } else {
    return t`We won't collect any usage events`;
  }
};

const getSubmitError = (error: unknown): string => {
  const message = getIn(error, ["data", "message"]);
  const errors = getIn(error, ["data", "errors"]);

  if (message) {
    return String(message);
  } else if (errors) {
    return String(Object.values(errors)[0]);
  } else {
    return t`An error occurred`;
  }
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default PreferencesStep;
