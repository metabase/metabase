import React, { useEffect, useState } from "react";
import { t } from "ttag";
import LogoIcon from "metabase/components/LogoIcon";
import { LOCALE_TIMEOUT } from "../../constants";
import SetupHelp from "../SetupHelp";
import {
  PageRoot,
  PageMain,
  PageTitle,
  PageBody,
  PageButton,
} from "./WelcomePage.styled";

export interface WelcomePageProps {
  isLocaleLoaded: boolean;
  onStepShow: () => void;
  onStepSubmit: () => void;
}

const WelcomePage = ({
  isLocaleLoaded,
  onStepShow,
  onStepSubmit,
}: WelcomePageProps): JSX.Element | null => {
  const isElapsed = useIsElapsed(LOCALE_TIMEOUT);

  useEffect(() => {
    onStepShow();
  }, [onStepShow]);

  if (!isElapsed && !isLocaleLoaded) {
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
        <PageButton
          primary
          autoFocus
          onClick={onStepSubmit}
        >{t`Let's get started`}</PageButton>
      </PageMain>
      <SetupHelp />
    </PageRoot>
  );
};

const useIsElapsed = (delay: number) => {
  const [isElapsed, setIsElapsed] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => setIsElapsed(true), delay);
    return () => clearTimeout(timeout);
  }, [delay]);

  return isElapsed;
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default WelcomePage;
