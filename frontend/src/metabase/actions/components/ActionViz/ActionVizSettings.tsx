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
import EmptyState from "metabase/components/EmptyState";
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
  const action = dashcard.action;

  const setAction = (newAction: WritebackAction) => {
    setActionForDashcard(dashcard, newAction);
  };

  return (
    <ActionSettingsWrapper>
      <ActionSettingsLeft>
        <h4 className="pb2">{t`Action Library`}</h4>
        <ConnectedActionPicker currentAction={action} onClick={setAction} />
      </ActionSettingsLeft>
      <ActionSettingsRight>
        {action ? (
          <>
            <ActionSettingsHeader>{action.name}</ActionSettingsHeader>
            <ParameterMapperContainer>
              <ConnectedActionParameterMappingForm
                dashcard={dashcard}
                dashboard={dashboard}
                action={dashcard.action}
              />
            </ParameterMapperContainer>
            <ModalActions>
              <Button onClick={onClose}>Cancel</Button>
              <Button primary onClick={onClose}>
                {t`Done`}
              </Button>
            </ModalActions>
          </>
        ) : (
          <EmptyActionState />
        )}
      </ActionSettingsRight>
    </ActionSettingsWrapper>
  );
}

const EmptyActionState = () => (
  <EmptyState className="p3" message={t`Select an action to get started`} />
);

export const ConnectedActionVizSettings = connect(
  null,
  mapDispatchToProps,
)(ActionVizSettings);
