import LogoIcon from "metabase/components/LogoIcon";
import { DatabaseStep } from "../DatabaseStep";
import { CompletedStep } from "../CompletedStep";
import { LanguageStep } from "../LanguageStep";
import { PreferencesStep } from "../PreferencesStep";
import { UserStep } from "../UserStep";
import { SetupHelp } from "../SetupHelp";
import { CloudMigrationHelp } from "./CloudMigrationHelp";
import { DatabaseHelp } from "./DatabaseHelp";
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
