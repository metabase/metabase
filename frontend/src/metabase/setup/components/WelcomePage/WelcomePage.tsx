import React, { useCallback, useEffect } from "react";
import { t } from "ttag";
import LogoIcon from "metabase/components/LogoIcon";
import { useForceUpdate } from "metabase/hooks/use-force-update";
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
  useEffect(() => {
    onStepShow();
  }, [onStepShow]);

  if (!isLocaleLoaded) {
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

export default WelcomePage;
