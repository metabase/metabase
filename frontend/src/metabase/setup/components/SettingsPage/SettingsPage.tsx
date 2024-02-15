import LogoIcon from "metabase/components/LogoIcon";
import { useSelector } from "metabase/lib/redux";
import { getSteps } from "metabase/setup/selectors";
import { CloudMigrationHelp } from "../CloudMigrationHelp";
import { CompletedStep } from "../CompletedStep";
import { DatabaseHelp } from "../DatabaseHelp";
import { DatabaseStep } from "../DatabaseStep";
import { LanguageStep } from "../LanguageStep";
import { DataUsageStep } from "../DataUsageStep";
import { SetupHelp } from "../SetupHelp";
import type { NumberedStepProps } from "../types";
import { UsageQuestionStep } from "../UsageQuestionStep";
import { UserStep } from "../UserStep";
import { PageBody, PageHeader } from "./SettingsPage.styled";

const STEP_COMPONENTS: Record<
  string,
  (props: NumberedStepProps) => React.ReactElement
> = {
  language: LanguageStep,
  user_info: UserStep,
  usage_question: UsageQuestionStep,
  db_connection: DatabaseStep,
  data_usage: DataUsageStep,
};

export const SettingsPage = (): JSX.Element => {
  const steps = useSelector(getSteps);

  return (
    <div data-testid="setup-forms">
      <PageHeader>
        <LogoIcon height={51} />
      </PageHeader>
      <PageBody>
        {steps.map(({ key }, index) => {
          const Component = STEP_COMPONENTS[key];
          if (Component) {
            return <Component key={key} stepLabel={index} />;
          }
        })}
        <CompletedStep />
        <CloudMigrationHelp />
        <SetupHelp />
        <DatabaseHelp />
      </PageBody>
    </div>
  );
};
