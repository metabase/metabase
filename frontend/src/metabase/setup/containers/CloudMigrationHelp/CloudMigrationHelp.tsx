import React from "react";
import { connect } from "react-redux";
import { t } from "ttag";

import HelpCard from "metabase/components/HelpCard";
import { SetupCardContainer } from "metabase/setup/components/SetupCardContainer";

import MetabaseSettings from "metabase/lib/settings";
import { getSetting } from "metabase/selectors/settings";

import type { State } from "metabase-types/store";

import { COMPLETED_STEP } from "../../constants";
import { isStepActive } from "../../selectors";

const mapStateToProps = (state: State) => ({
  isHosted: getSetting(state, "is-hosted?"),
  isStepActive: isStepActive(state, COMPLETED_STEP),
});

interface CloudMigrationHelpProps {
  isHosted: boolean;
  isStepActive: boolean;
}

const CloudMigrationHelp = ({
  isHosted,
  isStepActive,
}: CloudMigrationHelpProps) => {
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

export default connect(mapStateToProps)(CloudMigrationHelp);
