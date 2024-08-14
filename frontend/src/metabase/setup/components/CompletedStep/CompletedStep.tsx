import cx from "classnames";
import { useState } from "react";
import { t } from "ttag";

import ButtonsS from "metabase/css/components/buttons.module.css";
import { useSelector } from "metabase/lib/redux";
import { SUBSCRIBE_TOKEN, SUBSCRIBE_URL } from "metabase/setup/constants";
import { Switch } from "metabase/ui";

import { getIsStepActive } from "../../selectors";

import {
  StepBody,
  StepFooter,
  StepRoot,
  StepTitle,
} from "./CompletedStep.styled";

export const CompletedStep = (): JSX.Element | null => {
  const [checkboxValue, setCheckboxValue] = useState(false);
  const email = useSelector(state => state.setup.user?.email);

  const isStepActive = useSelector(state =>
    getIsStepActive(state, "completed"),
  );
  if (!isStepActive) {
    return null;
  }

  const baseUrl = window.MetabaseRoot ?? "/";

  const handleClick = () => {
    if (checkboxValue && email) {
      const body = new FormData();
      body.append("EMAIL", email);
      body.append(SUBSCRIBE_TOKEN, "");

      if ("sendBeacon" in navigator) {
        navigator.sendBeacon(SUBSCRIBE_URL, body);
      } else {
        fetch(SUBSCRIBE_URL, {
          method: "POST",
          mode: "no-cors",
          body,
          keepalive: true,
        });
      }
    }
  };

  return (
    <StepRoot>
      <StepTitle>{t`You're all set up!`}</StepTitle>
      <StepBody>
        <Switch
          checked={checkboxValue}
          onChange={e => setCheckboxValue(e.target.checked)}
          label={t`Get infrequent emails about new releases and feature updates.`}
        />
      </StepBody>
      <StepFooter>
        <a
          onClick={handleClick}
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
