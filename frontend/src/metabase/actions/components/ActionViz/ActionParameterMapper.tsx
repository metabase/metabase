import { useCallback } from "react";
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
import type Question from "metabase-lib/Question";

import {
  ParameterFormSection,
  ParameterFormLabel,
  ParameterFormBadge,
} from "./ActionParameterMapper.styled";
import { isParameterHidden, isParameterRequired } from "./utils";

interface ActionParameterMapperProps {
  dashcard: ActionDashboardCard;
  dashboard: Dashboard;
  model?: Question;
  action: WritebackAction;
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
  action,
  setParameterMapping,
}: ActionParameterMapperProps & DispatchProps) => {
  const actionParameters = action.parameters ?? [];
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
    <div>
      {actionParameters.map((actionParam: WritebackParameter) => {
        const isHidden = isParameterHidden(action, actionParam);
        const isRequired = isParameterRequired(action, actionParam);
        const mappedValue = currentMappings[getTargetKey(actionParam)];
        const showError = !mappedValue && isHidden && isRequired;
        const name = actionParam.name ?? actionParam.id;

        return (
          <ParameterFormSection
            key={actionParam.id}
            data-testid={`parameter-form-section-${actionParam.id}`}
          >
            <ParameterFormLabel error={showError}>
              <span>{`${name}${showError ? t`: is required` : ""}`}</span>
              {isHidden && <ParameterFormBadge>{t`Hidden`}</ParameterFormBadge>}
            </ParameterFormLabel>
            <Select
              value={mappedValue ?? null}
              onChange={(e: SelectChangeEvent<string>) =>
                handleParameterChange(e.target.value, actionParam.target)
              }
              options={[
                {
                  name:
                    isHidden && isRequired
                      ? t`Select a value`
                      : t`Ask the user`,
                  value: null,
                },
                ...dashboardParameters.map(dashboardParam => ({
                  key: dashboardParam.id,
                  name: dashboardParam.name,
                  value: dashboardParam.id,
                })),
              ]}
            />
          </ParameterFormSection>
        );
      })}
      {actionParameters.length === 0 && (
        <EmptyState message={t`This action has no parameters to map`} />
      )}
    </div>
  );
};

export const ConnectedActionParameterMappingForm = connect(
  null,
  mapDispatchToProps,
)(ActionParameterMappingForm);
