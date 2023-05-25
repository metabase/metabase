import React, { useEffect } from "react";
import { useTimeout } from "react-use";
import { t } from "ttag";
import { useDispatch, useSelector } from "metabase/lib/redux";
import LogoIcon from "metabase/components/LogoIcon";
import { loadDefaults, selectStep } from "../../actions";
import { LANGUAGE_STEP, LOCALE_TIMEOUT } from "../../constants";
import { getIsLocaleLoaded } from "../../selectors";
import SetupHelp from "../SetupHelp";
import {
  PageRoot,
  PageMain,
  PageTitle,
  PageBody,
  PageButton,
} from "./WelcomePage.styled";

export const WelcomePage = (): JSX.Element | null => {
  const [isElapsed] = useTimeout(LOCALE_TIMEOUT);
  const isLocaleLoaded = useSelector(getIsLocaleLoaded);

  const dispatch = useDispatch();
  const handleSubmit = () => dispatch(selectStep(LANGUAGE_STEP));

  useEffect(() => {
    dispatch(loadDefaults());
  }, [dispatch]);

  if (!isElapsed() && !isLocaleLoaded) {
    return null;
  }

  return (
    <PageRoot>
      <PageMain>
        <LogoIcon height={118} />
        <PageTitle>{t`Welcome to Metabase`}</PageTitle>
        <PageBody>
          {t`Looks like everything is working.`}{" "}
          {t`Now let’s get to know you, connect to your data, and start finding you some answers!`}
        </PageBody>
        <PageButton primary autoFocus onClick={handleSubmit}>
          {t`Let's get started`}
        </PageButton>
      </PageMain>
      <SetupHelp />
    </PageRoot>
  );
};
