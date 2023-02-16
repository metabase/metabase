import React from "react";
import { connect } from "react-redux";
import { t } from "ttag";

import type {
  ActionDashboardCard,
  Dashboard,
  WritebackAction,
} from "metabase-types/api";

import Button from "metabase/core/components/Button";

import { ConnectedActionPicker } from "metabase/actions/containers/ActionPicker/ActionPicker";
import { setActionForDashcard } from "metabase/dashboard/actions";
import EmptyState from "metabase/components/EmptyState";
import { ConnectedActionParameterMappingForm } from "./ActionParameterMapper";

import {
  ActionSettingsWrapper,
  ParameterMapperContainer,
  ActionSettingsHeader,
  ActionSettingsLeft,
  ActionSettingsRight,
  ModalActions,
} from "./ActionDashcardSettings.styled";

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

export function ActionDashcardSettings({
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
          </>
        ) : (
          <ParameterMapperContainer>
            <EmptyActionState />
          </ParameterMapperContainer>
        )}
        <ModalActions>
          <Button primary onClick={onClose}>
            {t`Done`}
          </Button>
        </ModalActions>
      </ActionSettingsRight>
    </ActionSettingsWrapper>
  );
}

const EmptyActionState = () => (
  <EmptyState className="p3" message={t`Select an action to get started`} />
);

export const ConnectedActionDashcardSettings = connect(
  null,
  mapDispatchToProps,
)(ActionDashcardSettings);
