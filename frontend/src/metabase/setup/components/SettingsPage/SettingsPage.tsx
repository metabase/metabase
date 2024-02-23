import LogoIcon from "metabase/components/LogoIcon";

import { CloudMigrationHelp } from "../CloudMigrationHelp";
import { CompletedStep } from "../CompletedStep";
import { DatabaseHelp } from "../DatabaseHelp";
import { DatabaseStep } from "../DatabaseStep";
import { LanguageStep } from "../LanguageStep";
import { PreferencesStep } from "../PreferencesStep";
import { SetupHelp } from "../SetupHelp";
import { UserStep } from "../UserStep";

import { PageBody, PageHeader } from "./SettingsPage.styled";

export const SettingsPage = (): JSX.Element => {
  return (
    <div data-testid="setup-forms">
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
        <CloudMigrationHelp />
        <SetupHelp />
      </PageBody>
    </div>
  );
};
