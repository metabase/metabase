import React, { useState } from "react";
import { connect } from "react-redux";
import { t } from "ttag";

import type {
  ActionDashboardCard,
  Dashboard,
  VisualizationSettings,
  WritebackAction,
} from "metabase-types/api";

import Button from "metabase/core/components/Button";

import { ConnectedActionPicker } from "metabase/actions/containers/ActionPicker/ActionPicker";
import { setActionForDashcard } from "metabase/dashboard/actions";
import { ConnectedActionParameterMappingForm } from "./ActionOptions";

import {
  ActionSettingsWrapper,
  ParameterMapperContainer,
  ActionSettingsHeader,
  ActionSettingsLeft,
  ActionSettingsRight,
  ModalActions,
} from "./ActionVizSettings.styled";

const mapDispatchToProps = {
  setActionForDashcard,
};

interface Props {
  dashboard: Dashboard;
  dashcard: ActionDashboardCard;
  onClose: () => void;
  setActionForDashcard: (
    dashcard: ActionDashboardCard,
    action: WritebackAction,
  ) => void;
}

export function ActionVizSettings({
  dashboard,
  dashcard,
  onClose,
  setActionForDashcard,
}: Props) {
  const [action, setAction] = useState(dashcard.action);

  const save = () => {
    action && setActionForDashcard(dashcard, action);
    onClose();
  };

  return (
    <ActionSettingsWrapper>
      <ActionSettingsLeft>
        <h3 className="pb2 text-medium">Actions</h3>
        <ConnectedActionPicker currentAction={action} onClick={setAction} />
      </ActionSettingsLeft>
      <ActionSettingsRight>
        <ActionSettingsHeader>{t`Action Settings`}</ActionSettingsHeader>
        <ParameterMapperContainer>
          <ConnectedActionParameterMappingForm
            dashcard={{
              ...dashcard,
              action,
            }}
            dashboard={dashboard}
          />
        </ParameterMapperContainer>
        <ModalActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button primary onClick={save}>
            Save
          </Button>
        </ModalActions>
      </ActionSettingsRight>
    </ActionSettingsWrapper>
  );
}

export const ConnectedActionVizSettings = connect(
  null,
  mapDispatchToProps,
)(ActionVizSettings);
