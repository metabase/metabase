import React from "react";
import { t } from "ttag";
import { useSelector } from "metabase/lib/redux";
import MetabaseSettings from "metabase/lib/settings";
import HelpCard from "metabase/components/HelpCard";
import { COMPLETED_STEP } from "../../constants";
import { getIsHosted, getIsStepActive } from "../../selectors";
import { SetupCardContainer } from "../SetupCardContainer";

export const CloudMigrationHelp = () => {
  const isHosted = useSelector(getIsHosted);
  const isStepActive = useSelector(state =>
    getIsStepActive(state, COMPLETED_STEP),
  );
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
