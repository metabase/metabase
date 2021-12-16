import React from "react";
import LogoIcon from "metabase/components/LogoIcon";
import { PageHeader, PageBody } from "./SettingsPage.styled";
import LanguageStep from "../../containers/LanguageStep";
import UserStep from "../../containers/UserStep";
import DatabaseStep from "../../containers/DatabaseStep";
import DatabaseHelp from "../../containers/DatabaseHelp";
import PreferencesStep from "../../containers/PreferencesStep";
import CompletedStep from "../../containers/CompletedStep";
import SetupHelp from "../SetupHelp";

const SettingsPage = () => (
  <div>
    <PageHeader>
      <LogoIcon height={51} />
    </PageHeader>
    <PageBody>
      <LanguageStep />
      <UserStep />
      <DatabaseStep />
      <PreferencesStep />
      <CompletedStep />
      <SetupHelp />
      <DatabaseHelp />
    </PageBody>
  </div>
);

export default SettingsPage;
