import React, { useCallback, useMemo } from "react";
import { t } from "ttag";
import { connect } from "react-redux";
import _ from "underscore";

import { useToggle } from "metabase/hooks/use-toggle";

import Icon from "metabase/components/Icon";
import Select from "metabase/core/components/Select";
import Button from "metabase/core/components/Button";

import TippyPopoverWithTrigger from "metabase/components/PopoverWithTrigger/TippyPopoverWithTrigger";
import ActionCreator from "metabase/actions/containers/ActionCreator";

import Actions from "metabase/entities/actions";
import Questions from "metabase/entities/questions";
import { setParameterMapping } from "metabase/dashboard/actions";

import type {
  ActionDashboardCard,
  ActionParametersMapping,
  WritebackParameter,
  WritebackAction,
  Dashboard,
} from "metabase-types/api";

import type { State } from "metabase-types/store";
import type {
  ParameterTarget,
  ParameterId,
} from "metabase-types/types/Parameter";
import type Question from "metabase-lib/Question";

import {
  ActionParameterTriggerContainer,
  ParameterMapperContainer,
  ParameterFormSection,
  ParameterFormLabel,
  ParameterMapperTitleContainer,
} from "./ActionOptions.styled";

interface ActionParameterMapperProps {
  dashcard: ActionDashboardCard;
  dashboard: Dashboard;
  model?: Question;
  action?: WritebackAction;
}

type NewParameterChangeEvent = {
  target: {
    value: string;
  };
};

type ParameterMappingFn = (
  parameterId: ParameterId,
  dashcardId: number,
  cardId: number,
  target: ParameterTarget,
) => void;

interface DispatchProps {
  setParameterMapping: ParameterMappingFn;
}

const mapDispatchToProps = {
  setParameterMapping,
};

export const ActionParameterOptions = ({
  dashcard,
  dashboard,
  action,
}: ActionParameterMapperProps) => {
  const [
    isActionCreatorOpen,
    { toggle: toggleIsActionCreatorVisible, turnOff: hideActionCreator },
  ] = useToggle();
  const actionParameters = dashcard?.action?.parameters ?? [];
  const dashboardParameters = dashboard.parameters ?? [];

  const canEditAction = dashcard.action?.type !== "implicit";
  const hasParameters = actionParameters.length && dashboardParameters.length;

  if (!hasParameters && !canEditAction) {
    return null;
  }

  if (!hasParameters) {
    return (
      <>
        <ActionParameterTriggerContainer onClick={toggleIsActionCreatorVisible}>
          <Icon name="pencil" size={11} tooltip={t`Edit action`} />
        </ActionParameterTriggerContainer>
        {isActionCreatorOpen && (
          <ActionCreator
            modelId={dashcard.card?.id}
            databaseId={dashcard.card?.database_id}
            actionId={dashcard?.action?.id}
            onClose={hideActionCreator}
          />
        )}
      </>
    );
  }

  return (
    <>
      {isActionCreatorOpen && (
        <ActionCreator
          modelId={dashcard.card?.id}
          databaseId={dashcard.card?.database_id}
          actionId={dashcard?.action?.id}
          onClose={hideActionCreator}
        />
      )}
      <TippyPopoverWithTrigger
        isInitiallyVisible={dashcard.justAdded}
        placement="right"
        renderTrigger={({ onClick, visible }) => (
          <ActionParameterTriggerContainer onClick={onClick}>
            <Icon
              name="bolt"
              size={14}
              tooltip={t`Assign action parameter values`}
            />
          </ActionParameterTriggerContainer>
        )}
        popoverContent={({ closePopover }) => (
          <ConnectedActionParameterMappingForm
            dashcard={dashcard}
            dashboard={dashboard}
            showEditModal={
              canEditAction
                ? () => {
                    toggleIsActionCreatorVisible();
                    closePopover();
                  }
                : undefined
            }
          />
        )}
      />
    </>
  );
};

const getTargetKey = (param: WritebackParameter | ActionParametersMapping) =>
  JSON.stringify(param.target);

export const ActionParameterMappingForm = ({
  dashcard,
  dashboard,
  action: passedAction,
  setParameterMapping,
  showEditModal,
}: ActionParameterMapperProps &
  DispatchProps & { showEditModal?: () => void }) => {
  const action = passedAction ?? dashcard?.action;
  const actionParameters = action?.parameters ?? [];
  const dashboardParameters = dashboard.parameters ?? [];

  const actionName = useMemo(
    () => action?.name ?? action?.id ?? t`Action`,
    [action],
  );

  const currentMappings = Object.fromEntries(
    dashcard.parameter_mappings?.map(mapping => [
      getTargetKey(mapping),
      mapping.parameter_id,
    ]) ?? [],
  );

  const handleParameterChange = useCallback(
    (dashboardParameterId, target) => {
      if (dashcard.card?.id) {
        setParameterMapping(
          dashboardParameterId,
          dashcard.id,
          dashcard.card.id,
          target,
        );
      }
    },
    [dashcard, setParameterMapping],
  );

  return (
    <ParameterMapperContainer>
      <ParameterMapperTitleContainer>
        <h4>{t`Connect ${actionName}`}</h4>
        {showEditModal && (
          <Button
            onlyIcon
            icon="pencil"
            iconSize={14}
            iconColor="text-medium"
            onClick={showEditModal}
          />
        )}
      </ParameterMapperTitleContainer>
      {actionParameters.map((actionParam: WritebackParameter) => (
        <ParameterFormSection key={actionParam.id}>
          <ParameterFormLabel>
            {actionParam.name ?? actionParam.id}
          </ParameterFormLabel>
          <Select
            value={currentMappings[getTargetKey(actionParam)] ?? null}
            onChange={(e: NewParameterChangeEvent) =>
              handleParameterChange(e?.target?.value, actionParam.target)
            }
            options={[
              { name: t`Ask the user`, value: null },
              ...dashboardParameters.map(dashboardParam => ({
                key: dashboardParam.id,
                name: dashboardParam.name,
                value: dashboardParam.id,
              })),
            ]}
          />
        </ParameterFormSection>
      ))}
    </ParameterMapperContainer>
  );
};

const ConnectedActionParameterMappingForm = _.compose(
  Actions.load({
    id: (state: State, props: ActionParameterMapperProps) =>
      props.dashcard.action?.id,
  }),
  Questions.load({
    id: (state: State, props: ActionParameterMapperProps) =>
      props?.dashcard.card?.id,
    entityAlias: "model",
  }),
  connect(null, mapDispatchToProps),
)(ActionParameterMappingForm);
