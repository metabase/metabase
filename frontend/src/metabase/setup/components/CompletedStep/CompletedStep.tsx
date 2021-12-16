import React from "react";
import { t } from "ttag";
import NewsletterForm from "metabase/components/NewsletterForm";
import {
  StepRoot,
  StepTitle,
  StepFooter,
  StepBody,
} from "./CompletedStep.styled";
import { UserInfo } from "../../types";

interface Props {
  user?: UserInfo;
  isActive: boolean;
}

const CompletedStep = ({ user, isActive }: Props): JSX.Element | null => {
  if (!isActive) {
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
