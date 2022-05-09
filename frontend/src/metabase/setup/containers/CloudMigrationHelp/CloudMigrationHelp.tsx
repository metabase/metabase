import React from "react";
import { connect } from "react-redux";
import { t } from "ttag";
import { State } from "metabase-types/store";
import HelpCard from "metabase/components/HelpCard";
import { COMPLETED_STEP } from "../../constants";
import { isStepActive } from "../../selectors";
import { SetupCardContainer } from "metabase/setup/components/SetupCardContainer";

const mapStateToProps = (state: State) => ({
  isHosted: state.settings.values["is-hosted?"],
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
        helpUrl={"https://metabase.com"}
      >{t`Check out our docs for how to migrate your self-hosted instance to Cloud.`}</HelpCard>
    </SetupCardContainer>
  );
};

export default connect(mapStateToProps)(CloudMigrationHelp);
