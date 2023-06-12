import { useCallback } from "react";
import { t } from "ttag";

import Select, { SelectChangeEvent } from "metabase/core/components/Select";
import EmptyState from "metabase/components/EmptyState";

import { setParameterMapping } from "metabase/dashboard/actions";

import type {
  ActionDashboardCard,
  ActionParametersMapping,
  Dashboard,
  WritebackParameter,
  WritebackAction,
} from "metabase-types/api";
import { useDispatch } from "metabase/lib/redux";
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
  currentMappings: Record<string, string>;
}

export const getTargetKey = (
  param: WritebackParameter | ActionParametersMapping,
) => JSON.stringify(param.target);

export const ActionParameterMappingForm = ({
  dashcard,
  dashboard,
  action,
  currentMappings,
}: ActionParameterMapperProps) => {
  const dispatch = useDispatch();
  const actionParameters = action.parameters;
  const dashboardParameters = dashboard.parameters ?? [];

  const handleParameterChange = useCallback(
    (dashboardParameterId, target) => {
      dispatch(
        setParameterMapping(
          dashboardParameterId,
          dashcard.id,
          undefined, // this is irrelevant for action parameters
          target,
        ),
      );
    },
    [dashcard, dispatch],
  );

  return (
    <div>
      {actionParameters.map((actionParam: WritebackParameter) => {
        const isHidden = isParameterHidden(action, actionParam);
        const isRequired = isParameterRequired(action, actionParam);
        const mappedValue = currentMappings[getTargetKey(actionParam)];
        const isParameterMapped = mappedValue != null;

        const showError = isHidden && isRequired && !isParameterMapped;
        const name = actionParam.name ?? actionParam.id;

        return (
          <ParameterFormSection
            key={actionParam.id}
            data-testid={`parameter-form-section-${actionParam.id}`}
          >
            <ParameterFormLabel error={showError}>
              <span>{`${name}${showError ? t`: required` : ""}`}</span>
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
