import React, { useEffect } from "react";
import { t } from "ttag";
import LogoIcon from "metabase/components/LogoIcon";
import SetupHelp from "../SetupHelp";
import {
  PageRoot,
  PageMain,
  PageTitle,
  PageBody,
  PageButton,
} from "./WelcomePage.styled";

export interface WelcomePageProps {
  onStepShow: () => void;
  onStepSubmit: () => void;
}

const WelcomePage = ({
  onStepShow,
  onStepSubmit,
}: WelcomePageProps): JSX.Element => {
  useEffect(() => {
    onStepShow();
  }, [onStepShow]);

  return (
    <PageRoot>
      <PageMain>
        <LogoIcon height={118} />
        <PageTitle>{t`Welcome to Metabase`}</PageTitle>
        <PageBody>
          {t`Looks like everything is working.`}{" "}
          {`Now let’s get to know you, connect to your data, and start finding you some answers!`}
        </PageBody>
        <PageButton
          primary
          onClick={onStepSubmit}
        >{t`Let's get started`}</PageButton>
      </PageMain>
      <SetupHelp />
    </PageRoot>
  );
};

export default WelcomePage;
