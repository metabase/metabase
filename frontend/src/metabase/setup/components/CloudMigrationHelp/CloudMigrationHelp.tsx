import { t } from "ttag";
import { useSelector } from "metabase/lib/redux";
import MetabaseSettings from "metabase/lib/settings";
import HelpCard from "metabase/components/HelpCard";
import { getIsHosted, getIsStepActive } from "../../selectors";
import { SetupCardContainer } from "../SetupCardContainer";

export const CloudMigrationHelp = () => {
  const isHosted = useSelector(getIsHosted);
  const isStepActive = useSelector(state =>
    getIsStepActive(state, "completed"),
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
