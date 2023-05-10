import React from "react";
import { t } from "ttag";
import NewsletterForm from "../../containers/NewsletterForm";
import {
  StepBody,
  StepFooter,
  StepRoot,
  StepTitle,
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

  const baseUrl = (window as any).MetabaseRoot || "/";

  return (
    <StepRoot>
      <StepTitle>{t`You're all set up!`}</StepTitle>
      <StepBody>
        <NewsletterForm />
      </StepBody>
      <StepFooter>
        <a className="Button Button--primary" href={baseUrl}>
          {t`Take me to Metabase`}
        </a>
      </StepFooter>
    </StepRoot>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default CompletedStep;
