import { t } from "ttag";

import HelpCard from "metabase/components/HelpCard";
import { useSelector } from "metabase/lib/redux";
import MetabaseSettings from "metabase/lib/settings";

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
        helpUrl={MetabaseSettings.migrateToCloudGuideUrl()}
      >{t`Check out our docs for how to migrate your self-hosted instance to Cloud.`}</HelpCard>
    </SetupCardContainer>
  );
};
