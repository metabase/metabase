import { t } from "ttag";

import { HelpCard } from "metabase/common/components/HelpCard";
import { useSetting } from "metabase/common/hooks";
import { migrateToCloudGuideUrl } from "metabase/selectors/settings";

import { useStep } from "../../useStep";
import { SetupCardContainer } from "../SetupCardContainer";

export const CloudMigrationHelp = () => {
  const { isStepActive } = useStep("completed");
  const isHosted = useSetting("is-hosted?");

  const isVisible = isHosted && isStepActive;

  return (
    <SetupCardContainer isVisible={isVisible}>
      <HelpCard
        title={t`Migrating from self-hosted?`}
        helpUrl={migrateToCloudGuideUrl()}
      >{t`Check out our docs for how to migrate your self-hosted instance to Cloud.`}</HelpCard>
    </SetupCardContainer>
  );
};
