import React from "react";
import { t } from "ttag";
import { connect } from "react-redux";

import type { ActionDashboardCard, Dashboard } from "metabase-types/api";

import { setEditingDashcardId } from "metabase/dashboard/actions";

import DashCardActionButton from "./DashCardActionButton";

const mapDispatchToProps = {
  setEditingDashcardId,
};

interface Props {
  dashboard: Dashboard;
  dashcard: ActionDashboardCard;
  setEditingDashcardId: (dashcardId: number) => void;
}

function ActionSettingsButton({ dashcard, setEditingDashcardId }: Props) {
  if (dashcard.justAdded) {
    setEditingDashcardId(dashcard.id);
  }

  return (
    <DashCardActionButton
      tooltip={t`Action Settings`}
      onClick={() => setEditingDashcardId(dashcard.id)}
    >
      <DashCardActionButton.Icon name="gear" />
    </DashCardActionButton>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(null, mapDispatchToProps)(ActionSettingsButton);
