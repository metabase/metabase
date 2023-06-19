import { useCallback, useMemo } from "react";
import { t } from "ttag";
import { connect } from "react-redux";

import Select, { SelectChangeEvent } from "metabase/core/components/Select";
import EmptyState from "metabase/components/EmptyState";

import { setParameterMapping } from "metabase/dashboard/actions";

import type {
  ActionDashboardCard,
  ActionParametersMapping,
  Dashboard,
  ParameterId,
  ParameterTarget,
  WritebackParameter,
  WritebackAction,
} from "metabase-types/api";
import { sortActionParams } from "metabase/actions/utils";
import type Question from "metabase-lib/Question";

import {
  ParameterFormSection,
  ParameterFormLabel,
} from "./ActionParameterMapper.styled";

interface ActionParameterMapperProps {
  dashcard: ActionDashboardCard;
  dashboard: Dashboard;
  model?: Question;
  action?: WritebackAction;
}

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

  const dashboardParameters = dashboard.parameters ?? [];

  const sortedParameters = useMemo(() => {
    const actionParameters = action?.parameters ?? [];

    return actionParameters && action?.visualization_settings?.fields
      ? [...actionParameters].sort(
          sortActionParams(action?.visualization_settings),
        )
      : actionParameters || [];
  }, [action]);

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
    <div>
      {sortedParameters.map((actionParam: WritebackParameter) => (
        <ParameterFormSection key={actionParam.id}>
          <ParameterFormLabel>
            {actionParam.name ?? actionParam.id}
          </ParameterFormLabel>
          <Select
            value={currentMappings[getTargetKey(actionParam)] ?? null}
            onChange={(e: SelectChangeEvent<string>) =>
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
      {sortedParameters.length === 0 && (
        <EmptyState message={t`This action has no parameters to map`} />
      )}
    </div>
  );
};

export const ConnectedActionParameterMappingForm = connect(
  null,
  mapDispatchToProps,
)(ActionParameterMappingForm);
