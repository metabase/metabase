import { t } from "ttag";

import { HelpCard } from "metabase/common/components/HelpCard";
import { useSelector } from "metabase/lib/redux";
import { migrateToCloudGuideUrl } from "metabase/selectors/settings";

import { getIsHosted } from "../../selectors";
import { useStep } from "../../useStep";
import { SetupCardContainer } from "../SetupCardContainer";

export const CloudMigrationHelp = () => {
  const { isStepActive } = useStep("completed");
  const isHosted = useSelector(getIsHosted);

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
