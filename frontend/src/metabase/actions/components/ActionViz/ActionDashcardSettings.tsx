import { useMemo } from "react";
import { connect } from "react-redux";
import { t } from "ttag";

import { ConnectedActionPicker } from "metabase/actions/containers/ActionPicker";
import EmptyState from "metabase/components/EmptyState";
import Button from "metabase/core/components/Button";
import CS from "metabase/css/core/index.css";
import { setActionForDashcard } from "metabase/dashboard/actions";
import type {
  ActionDashboardCard,
  Dashboard,
  WritebackAction,
} from "metabase-types/api";

import {
  ActionSettingsWrapper,
  ParameterMapperContainer,
  ActionSettingsHeader,
  ActionSettingsLeft,
  ActionSettingsRight,
  ModalActions,
} from "./ActionDashcardSettings.styled";
import {
  ActionParameterMappingForm,
  getTargetKey,
} from "./ActionParameterMapping";
import { ExplainerText } from "./ExplainerText";
import {
  getParameterDefaultValue,
  isParameterHidden,
  isParameterRequired,
} from "./utils";

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
  const currentMappings = useMemo(
    () =>
      Object.fromEntries(
        dashcard.parameter_mappings?.map(mapping => [
          getTargetKey(mapping),
          mapping.parameter_id,
        ]) ?? [],
      ),
    [dashcard.parameter_mappings],
  );

  const isFormInvalid =
    !!action &&
    action.parameters.some(actionParameter => {
      const isHidden = isParameterHidden(action, actionParameter);
      const isRequired = isParameterRequired(action, actionParameter);
      const isParameterMapped =
        currentMappings[getTargetKey(actionParameter)] != null;
      const defaultValue = getParameterDefaultValue(action, actionParameter);
      const hasDefaultValue = defaultValue != null;

      return isHidden && isRequired && !isParameterMapped && !hasDefaultValue;
    });

  return (
    <ActionSettingsWrapper>
      <ActionSettingsLeft>
        <h4 className={CS.pb2}>{t`Action Library`}</h4>
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
                <ExplainerText />
              </>
            )}
            <ParameterMapperContainer>
              <ActionParameterMappingForm
                dashcard={dashcard}
                dashboard={dashboard}
                action={action}
                currentMappings={currentMappings}
              />
            </ParameterMapperContainer>
          </>
        ) : (
          <ParameterMapperContainer>
            <EmptyActionState />
          </ParameterMapperContainer>
        )}
        <ModalActions>
          <Button primary onClick={onClose} disabled={isFormInvalid}>
            {t`Done`}
          </Button>
        </ModalActions>
      </ActionSettingsRight>
    </ActionSettingsWrapper>
  );
}

const EmptyActionState = () => (
  <EmptyState className={CS.p3} message={t`Select an action to get started`} />
);

export const ConnectedActionDashcardSettings = connect(
  null,
  mapDispatchToProps,
)(ActionDashcardSettings);
