import React, { useRef } from "react";
import _ from "underscore";
import { t } from "ttag";

import ModalWithTrigger from "metabase/components/ModalWithTrigger";

import { ConnectedActionVizSettings } from "metabase/actions/components/ActionViz/ActionVizSettings";

import type { ActionDashboardCard, Dashboard } from "metabase-types/api";

import DashCardActionButton from "./DashCardActionButton";

interface Props {
  dashboard: Dashboard;
  dashcard: ActionDashboardCard;
}

export default function ActionSettingsButton({ dashboard, dashcard }: Props) {
  const actionVizSettingsModalRef = useRef<any>(null);

  return (
    <ModalWithTrigger
      ref={actionVizSettingsModalRef}
      wide
      isInitiallyOpen={dashcard.justAdded}
      triggerElement={
        <DashCardActionButton tooltip={t`Action Settings`}>
          <DashCardActionButton.Icon name="bolt" />
        </DashCardActionButton>
      }
      enableMouseEvents
    >
      <ConnectedActionVizSettings
        dashboard={dashboard}
        dashcard={dashcard}
        onClose={() => {
          actionVizSettingsModalRef.current?.close();
        }}
      />
    </ModalWithTrigger>
  );
}
