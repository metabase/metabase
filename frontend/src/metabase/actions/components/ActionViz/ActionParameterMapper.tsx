import React, { useCallback, useMemo } from "react";
import { t } from "ttag";
import { connect } from "react-redux";
import _ from "underscore";

import Select from "metabase/core/components/Select";

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
import EmptyState from "metabase/components/EmptyState";
import type Question from "metabase-lib/Question";

import {
  ParameterMapperContainer,
  ParameterFormSection,
  ParameterFormLabel,
} from "./ActionParameterMapper.styled";

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
  cardId: number | undefined,
  target: ParameterTarget,
) => void;

interface DispatchProps {
  setParameterMapping: ParameterMappingFn;
}

const mapDispatchToProps = {
  setParameterMapping,
};

const getTargetKey = (param: WritebackParameter | ActionParametersMapping) =>
  JSON.stringify(param.target);

export const ActionParameterMappingForm = ({
  dashcard,
  dashboard,
  action: passedAction,
  setParameterMapping,
}: ActionParameterMapperProps & DispatchProps) => {
  const action = passedAction ?? dashcard?.action;
  const actionParameters = action?.parameters ?? [];
  const dashboardParameters = dashboard.parameters ?? [];

  const currentMappings = Object.fromEntries(
    dashcard.parameter_mappings?.map(mapping => [
      getTargetKey(mapping),
      mapping.parameter_id,
    ]) ?? [],
  );

  const handleParameterChange = useCallback(
    (dashboardParameterId, target) => {
      setParameterMapping(
        dashboardParameterId,
        dashcard.id,
        undefined, // this is irrelevant for action parameters
        target,
      );
    },
    [dashcard, setParameterMapping],
  );

  return (
    <ParameterMapperContainer>
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
      {actionParameters.length === 0 && (
        <EmptyState message={t`This action has no parameters to map`} />
      )}
    </ParameterMapperContainer>
  );
};

export const ConnectedActionParameterMappingForm = _.compose(
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
