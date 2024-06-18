import { useCallback, useState, useMemo } from "react";
import { t } from "ttag";

import { sortActionParams } from "metabase/actions/utils";
import EmptyState from "metabase/components/EmptyState";
import type { SelectChangeEvent } from "metabase/core/components/Select";
import Select from "metabase/core/components/Select";
import { setParameterMapping } from "metabase/dashboard/actions";
import { useDispatch } from "metabase/lib/redux";
import type Question from "metabase-lib/v1/Question";
import type {
  ActionDashboardCard,
  ActionParametersMapping,
  Dashboard,
  WritebackParameter,
  WritebackAction,
  Parameter,
  ParameterTarget,
} from "metabase-types/api";

import {
  ParameterFormSection,
  ParameterFormLabel,
  ParameterFormBadge,
} from "./ActionParameterMapping.styled";
import {
  getParameterDefaultValue,
  isParameterHidden,
  isParameterRequired,
} from "./utils";

interface ActionParameterMappingProps {
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
}: ActionParameterMappingProps) => {
  const dispatch = useDispatch();
  const dashboardParameters = dashboard.parameters ?? [];

  const sortedParameters = useMemo(() => {
    const actionParameters = action?.parameters ?? [];

    return actionParameters && action?.visualization_settings?.fields
      ? [...actionParameters].sort(
          sortActionParams(action?.visualization_settings),
        )
      : actionParameters || [];
  }, [action]);

  const handleParameterChange = useCallback(
    (dashboardParameterId: any, target: ParameterTarget) => {
      dispatch(
        setParameterMapping(
          dashboardParameterId,
          dashcard.id,
          -1, // this is irrelevant for action parameters
          target,
        ),
      );
    },
    [dashcard, dispatch],
  );

  return (
    <div>
      {sortedParameters.map((actionParameter: WritebackParameter) => {
        const mappedValue = currentMappings[getTargetKey(actionParameter)];

        return (
          <ActionParameterMappingItem
            key={actionParameter.id}
            action={action}
            actionParameter={actionParameter}
            mappedValue={mappedValue}
            dashboardParameters={dashboardParameters}
            onChange={handleParameterChange}
          />
        );
      })}
      {sortedParameters.length === 0 && (
        <EmptyState message={t`This action has no parameters to map`} />
      )}
    </div>
  );
};

interface ActionParameterMappingItemProps {
  action: WritebackAction;
  actionParameter: WritebackParameter;
  mappedValue: string;
  dashboardParameters: Parameter[];
  onChange: (value: string | null, target: ParameterTarget) => void;
}

const DEFAULT_VALUE = "default value";

export const ActionParameterMappingItem = ({
  action,
  actionParameter,
  mappedValue,
  dashboardParameters,
  onChange,
}: ActionParameterMappingItemProps) => {
  const [value, setValue] = useState(mappedValue ?? null);

  const isHidden = isParameterHidden(action, actionParameter);
  const isRequired = isParameterRequired(action, actionParameter);
  const defaultValue = getParameterDefaultValue(action, actionParameter);
  const isParameterMapped = mappedValue != null;
  const hasDefaultValue = defaultValue != null;
  const showError =
    isHidden && isRequired && !isParameterMapped && !hasDefaultValue;
  const name = actionParameter.name ?? actionParameter.id;

  const handleChange = (
    e: SelectChangeEvent<string>,
    target: ParameterTarget,
  ) => {
    const value = e.target.value;

    setValue(e.target.value);

    if (value !== DEFAULT_VALUE) {
      onChange(e.target.value, actionParameter.target);
    } else {
      onChange(null, target);
    }
  };

  return (
    <ParameterFormSection
      data-testid={`parameter-form-section-${actionParameter.id}`}
    >
      <ParameterFormLabel error={showError}>
        <span>{`${name}${showError ? t`: required` : ""}`}</span>
        {isHidden && <ParameterFormBadge>{t`Hidden`}</ParameterFormBadge>}
      </ParameterFormLabel>
      <Select
        value={value}
        onChange={handleChange}
        options={[
          ...getDefaultOptions({
            isRequired,
            isHidden,
            hasDefaultValue,
            defaultValue,
          }),
          ...dashboardParameters.map(dashboardParam => ({
            key: dashboardParam.id,
            name: dashboardParam.name,
            value: dashboardParam.id,
          })),
        ]}
      />
    </ParameterFormSection>
  );
};

function getDefaultOptions({
  isHidden,
  isRequired,
  hasDefaultValue,
  defaultValue,
}: {
  isHidden: boolean;
  isRequired: boolean;
  hasDefaultValue: boolean;
  defaultValue?: string | number;
}) {
  const defaultOptions = [];

  defaultOptions.push({
    name: isHidden ? t`Select a value` : t`Ask the user`,
    value: null,
  });

  if (isHidden && isRequired && hasDefaultValue) {
    defaultOptions.push({
      name: defaultValue,
      value: DEFAULT_VALUE,
    });
  }

  return defaultOptions;
}
