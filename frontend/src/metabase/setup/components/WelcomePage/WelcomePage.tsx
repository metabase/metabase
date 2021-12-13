import React from "react";
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
  onChangeStep: (step: number) => void;
}

const WelcomePage = ({ onChangeStep }: Props) => {
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
          onClick={() => onChangeStep(LANGUAGE_STEP)}
        >{t`Let's get started`}</PageButton>
      </PageMain>
      <SetupFooter />
    </PageRoot>
  );
};

export default WelcomePage;
