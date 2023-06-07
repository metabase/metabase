import { connect } from "react-redux";
import { t } from "ttag";

import Button from "metabase/core/components/Button";
import EmptyState from "metabase/components/EmptyState";

import MetabaseSettings from "metabase/lib/settings";

import { ConnectedActionPicker } from "metabase/actions/containers/ActionPicker/ActionPicker";
import { setActionForDashcard } from "metabase/dashboard/actions";

import type {
  ActionDashboardCard,
  Dashboard,
  WritebackAction,
} from "metabase-types/api";

import { ConnectedActionParameterMappingForm } from "./ActionParameterMapper";
import {
  ActionSettingsWrapper,
  ParameterMapperContainer,
  ActionSettingsHeader,
  ActionSettingsLeft,
  ActionSettingsRight,
  ModalActions,
  ExplainerText,
  BrandLinkWithLeftMargin,
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

  const hasParameters = !!action?.parameters?.length;

  return (
    <ActionSettingsWrapper>
      <ActionSettingsLeft>
        <h4 className="pb2">{t`Action Library`}</h4>
        <ConnectedActionPicker currentAction={action} onClick={setAction} />
      </ActionSettingsLeft>
      <ActionSettingsRight>
        {action ? (
          <>
            {hasParameters && (
              <>
                <ActionSettingsHeader>
                  {t`Where should the values for '${action.name}' come from?`}
                </ActionSettingsHeader>
                <ExplainerText>
                  {t`You can either ask users to enter values, or use the value of a dashboard filter.`}
                  <BrandLinkWithLeftMargin
                    href={MetabaseSettings.docsUrl("dashboards/actions")}
                  >
                    {t`Learn more.`}
                  </BrandLinkWithLeftMargin>
                </ExplainerText>
              </>
            )}
            <ParameterMapperContainer>
              <ConnectedActionParameterMappingForm
                dashcard={dashcard}
                dashboard={dashboard}
                action={action}
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
