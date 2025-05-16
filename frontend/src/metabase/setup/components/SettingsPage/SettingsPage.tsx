import LogoIcon from "metabase/components/LogoIcon";
import { useSelector } from "metabase/lib/redux";
import { getIsEmbeddingUseCase, getSteps } from "metabase/setup/selectors";
import type { SetupStep } from "metabase/setup/types";
import { Box, Flex } from "metabase/ui";

import { CloudMigrationHelp } from "../CloudMigrationHelp";
import { CompletedStep } from "../CompletedStep";
import { DataUsageStep } from "../DataUsageStep";
import { DatabaseHelp } from "../DatabaseHelp";
import { DatabaseStep } from "../DatabaseStep";
import { LanguageSelector } from "../LanguageSelector";
import { LanguageStep } from "../LanguageStep";
import { LicenseTokenStep } from "../LicenseTokenStep";
import { SetupHelp } from "../SetupHelp";
import { UsageQuestionStep } from "../UsageQuestionStep";
import { UserStep } from "../UserStep";
import type { NumberedStepProps } from "../types";

import S from "./SettingsPage.module.css";

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
  const isEmbeddingUseCase = useSelector(getIsEmbeddingUseCase);
  const SELECT_WIDTH = "10rem";

  return (
    <div data-testid="setup-forms">
      <Box component="header" className={S.PageHeader}>
        <Flex align="center" justify="space-between">
          <Box w={SELECT_WIDTH} className={S.Decoy} />
          <LogoIcon height={51} />
          <Box w={SELECT_WIDTH}>
            {isEmbeddingUseCase && <LanguageSelector />}
          </Box>
        </Flex>
      </Box>
      <Box className={S.PageBody}>
        {steps.map(({ key }, index) => {
          const Component = STEP_COMPONENTS[key];
          if (Component) {
            const [firstStep] = steps;
            const hasWelcomeStep = firstStep.key === "welcome";
            const stepIndex = hasWelcomeStep ? index : index + 1;

            return <Component key={key} stepLabel={stepIndex} />;
          }
        })}
        <CompletedStep />
        <CloudMigrationHelp />
        <SetupHelp />
        <DatabaseHelp />
      </Box>
    </div>
  );
};
