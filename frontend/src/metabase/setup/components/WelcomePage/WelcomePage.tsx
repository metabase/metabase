import React, { useCallback } from "react";
import { t } from "ttag";
import LogoIcon from "metabase/components/LogoIcon";
import SetupFooter from "../SetupFooter";
import { LANGUAGE_STEP } from "../../constants";
import {
  PageRoot,
  PageMain,
  PageTitle,
  PageBody,
  PageButton,
} from "./WelcomePage.styled";

interface Props {
  onStepChange?: (step: number) => void;
}

const WelcomePage = ({ onStepChange }: Props) => {
  const handleClick = useCallback(() => {
    onStepChange && onStepChange(LANGUAGE_STEP);
  }, [onStepChange]);

  return (
    <PageRoot>
      <PageMain>
        <LogoIcon height={118} />
        <PageTitle>{t`Welcome to Metabase`}</PageTitle>
        <PageBody>
          {t`Looks like everything is working. Now let’s get to know you, connect to your data, and start finding you some answers!`}
        </PageBody>
        <PageButton
          primary
          onClick={handleClick}
        >{t`Let's get started`}</PageButton>
      </PageMain>
      <SetupFooter />
    </PageRoot>
  );
};

export default WelcomePage;
