import React from "react";
import { t } from "ttag";
import NewsletterForm from "../../containers/NewsletterForm";
import {
  StepRoot,
  StepTitle,
  StepFooter,
  StepBody,
} from "./CompletedStep.styled";

export interface CompletedStepProps {
  isStepActive: boolean;
}

const CompletedStep = ({
  isStepActive,
}: CompletedStepProps): JSX.Element | null => {
  if (!isStepActive) {
    return null;
  }

  return (
    <StepRoot>
      <StepTitle>{t`You're all set up!`}</StepTitle>
      <StepBody>
        <NewsletterForm />
      </StepBody>
      <StepFooter>
        <a
          className="Button Button--primary"
          href="/"
        >{t`Take me to Metabase`}</a>
      </StepFooter>
    </StepRoot>
  );
};

export default CompletedStep;
