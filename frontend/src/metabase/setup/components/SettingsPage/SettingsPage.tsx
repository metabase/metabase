import LogoIcon from "metabase/components/LogoIcon";
import { isNotFalsy } from "metabase/lib/types";
import { useSelector } from "metabase/lib/redux";
import { CloudMigrationHelp } from "../CloudMigrationHelp";
import { DatabaseStep } from "../DatabaseStep";
import { CompletedStep } from "../CompletedStep";
import { LanguageStep } from "../LanguageStep";
import { PreferencesStep } from "../PreferencesStep";
import { UserStep } from "../UserStep";
import { SetupHelp } from "../SetupHelp";
import { DatabaseHelp } from "../DatabaseHelp";
import { UsageQuestionStep } from "../UsageQuestionStep";
import { PageBody, PageHeader } from "./SettingsPage.styled";

export const SettingsPage = (): JSX.Element => {
  const usageReason = useSelector(s => s.setup.usageReason);

  const numberedSteps = [
    { component: LanguageStep, key: "language-step" },
    { component: UserStep, key: "user-step" },
    { component: UsageQuestionStep, key: "usage-question-step" },
    usageReason !== "embedding" && {
      component: DatabaseStep,
      key: "database-step",
    },
    { component: PreferencesStep, key: "preferences-step" },
  ].filter(isNotFalsy);

  return (
    <div data-testid="setup-forms">
      <PageHeader>
        <LogoIcon height={51} />
      </PageHeader>
      <PageBody>
        {numberedSteps.map(({ component: Component, key }, index) => (
          <Component key={key} stepLabel={index + 1} />
        ))}
        <CompletedStep />
        <CloudMigrationHelp />
        <SetupHelp />
        <DatabaseHelp />
      </PageBody>
    </div>
  );
};
