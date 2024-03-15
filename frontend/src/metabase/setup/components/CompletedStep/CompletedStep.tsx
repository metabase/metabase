import cx from "classnames";
import { t } from "ttag";

import ButtonsS from "metabase/css/components/buttons.module.css";
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
        <a
          className={cx(ButtonsS.Button, ButtonsS.ButtonPrimary)}
          href={baseUrl}
        >
          {t`Take me to Metabase`}
        </a>
      </StepFooter>
    </StepRoot>
  );
};
