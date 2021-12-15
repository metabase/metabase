import React from "react";
import { t } from "ttag";
import Link from "metabase/components/Link";
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
        <Link
          className="Button Button--primary"
          to="/"
        >{t`Take me to Metabase`}</Link>
      </StepFooter>
    </StepRoot>
  );
};

export default CompletedStep;
