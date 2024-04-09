import LogoIcon from "metabase/components/LogoIcon";
import { useSelector } from "metabase/lib/redux";
import { getSteps } from "metabase/setup/selectors";
import type { SetupStep } from "metabase/setup/types";

import { CloudMigrationHelp } from "../CloudMigrationHelp";
import { CompletedStep } from "../CompletedStep";
import { DataUsageStep } from "../DataUsageStep";
import { DatabaseHelp } from "../DatabaseHelp";
import { DatabaseStep } from "../DatabaseStep";
import { LanguageStep } from "../LanguageStep";
import { LicenseTokenStep } from "../LicenseTokenStep";
import { SetupHelp } from "../SetupHelp";
import { UsageQuestionStep } from "../UsageQuestionStep";
import { UserStep } from "../UserStep";
import type { NumberedStepProps } from "../types";

import { PageBody, PageHeader } from "./SettingsPage.styled";

const STEP_COMPONENTS: Partial<
  Record<SetupStep, (props: NumberedStepProps) => React.ReactElement>
> = {
  language: LanguageStep,
  user_info: UserStep,
  usage_question: UsageQuestionStep,
  db_connection: DatabaseStep,
  license_token: LicenseTokenStep,
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
