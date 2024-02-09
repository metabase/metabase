import { t } from "ttag";
import { useSelector } from "metabase/lib/redux";
import { getIsStepActive } from "../../selectors";
import { NewsletterForm } from "../NewsletterForm";
import {
  StepBody,
  StepFooter,
  StepRoot,
  StepTitle,
} from "./CompletedStep.styled";

export const CompletedStep = (): JSX.Element | null => {
  const isStepActive = useSelector(state =>
    getIsStepActive(state, "completed"),
  );
  if (!isStepActive) {
    return null;
  }

  const baseUrl = window.MetabaseRoot ?? "/";

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
