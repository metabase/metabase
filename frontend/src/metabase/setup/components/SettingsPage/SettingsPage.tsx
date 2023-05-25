import React from "react";
import LogoIcon from "metabase/components/LogoIcon";
import MigrationHelp from "metabase/setup/containers/CloudMigrationHelp";
import { CompletedStep } from "../CompletedStep";
import { LanguageStep } from "../LanguageStep";
import { PreferencesStep } from "../PreferencesStep";
import { UserStep } from "../UserStep";
import { SetupHelp } from "../SetupHelp";
import DatabaseStep from "../../containers/DatabaseStep";
import { DatabaseHelp } from "../DatabaseHelp";
import { PageBody, PageHeader } from "./SettingsPage.styled";

export const SettingsPage = (): JSX.Element => {
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
        <MigrationHelp />
        <SetupHelp />
      </PageBody>
    </div>
  );
};
