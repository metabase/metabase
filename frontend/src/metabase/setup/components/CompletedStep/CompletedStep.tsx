import cx from "classnames";
import { type ChangeEvent, useState } from "react";
import { t } from "ttag";

import ButtonsS from "metabase/css/components/buttons.module.css";
import { useSelector } from "metabase/redux";
import { subscribeToNewsletter } from "metabase/setup/utils";
import { Switch, Title } from "metabase/ui";

import { getIsStepActive, getUserEmail } from "../../selectors";

import { StepBody, StepFooter, StepRoot } from "./CompletedStep.styled";
import { trackNewsletterToggleClicked } from "./analytics";

export const CompletedStep = (): JSX.Element | null => {
  const [checkboxValue, setCheckboxValue] = useState(false);
  const email = useSelector(getUserEmail);

  const isStepActive = useSelector((state) =>
    getIsStepActive(state, "completed"),
  );
  if (!isStepActive) {
    return null;
  }

  const baseUrl = window.MetabaseRoot ?? "/";

  const handleSwitchToggle = (e: ChangeEvent<HTMLInputElement>) => {
    setCheckboxValue(e.target.checked);
    trackNewsletterToggleClicked(e.target.checked);
  };

  const handleGoToMetabase = () => {
    if (checkboxValue && email) {
      subscribeToNewsletter(email);
    }
  };

  return (
    <StepRoot>
      <Title order={2}>{t`You're all set up!`}</Title>
      <StepBody>
        <Switch
          checked={checkboxValue}
          onChange={handleSwitchToggle}
          label={t`Get infrequent emails about new releases and feature updates.`}
        />
      </StepBody>
      <StepFooter>
        <a
          onClick={handleGoToMetabase}
          className={cx(
            ButtonsS.Button,
            ButtonsS.ButtonPrimary,
            ButtonsS.ButtonLarge,
          )}
          href={baseUrl}
        >
          {t`Take me to Metabase`}
        </a>
      </StepFooter>
    </StepRoot>
  );
};
