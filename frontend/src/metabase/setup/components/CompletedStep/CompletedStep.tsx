import React from "react";
import { t } from "ttag";
import NewsletterForm from "../NewsletterForm";
import {
  StepRoot,
  StepTitle,
  StepFooter,
  StepBody,
} from "./CompletedStep.styled";
import { UserInfo } from "../../types";

export interface CompletedStepProps {
  user?: UserInfo;
  isStepActive: boolean;
}

const CompletedStep = ({
  user,
  isStepActive,
}: CompletedStepProps): JSX.Element | null => {
  if (!isStepActive) {
    return null;
  }

  return (
    <StepRoot>
      <StepTitle>{t`You're all set up!`}</StepTitle>
      <StepBody>
        <NewsletterForm initialEmail={user?.email} />
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
