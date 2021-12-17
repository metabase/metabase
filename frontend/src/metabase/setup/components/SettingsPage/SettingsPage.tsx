import React, { useEffect } from "react";
import LogoIcon from "metabase/components/LogoIcon";
import { PageHeader, PageBody } from "./SettingsPage.styled";
import LanguageStep from "../../containers/LanguageStep";
import UserStep from "../../containers/UserStep";
import DatabaseStep from "../../containers/DatabaseStep";
import DatabaseHelp from "../../containers/DatabaseHelp";
import PreferencesStep from "../../containers/PreferencesStep";
import CompletedStep from "../../containers/CompletedStep";
import SetupHelp from "../SetupHelp";

export interface Props {
  step: number;
  onStepShow: (step: number) => void;
}

const SettingsPage = ({ step, onStepShow }: Props) => {
  useEffect(() => {
    onStepShow(step);
  }, [step, onStepShow]);

  return (
    <div>
      <PageHeader>
        <LogoIcon height={51} />
      </PageHeader>
      <PageBody>
        <LanguageStep />
        <UserStep />
        <DatabaseStep />
        <DatabaseHelp />
        <PreferencesStep />
        <CompletedStep />
        <SetupHelp />
      </PageBody>
    </div>
  );
};

export default SettingsPage;
