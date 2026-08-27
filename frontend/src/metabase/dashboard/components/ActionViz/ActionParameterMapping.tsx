import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import { sortActionParams } from "metabase/actions/utils";
import { EmptyState } from "metabase/common/components/EmptyState";
import { setParameterMapping } from "metabase/dashboard/actions";
import { useDispatch } from "metabase/redux";
import { Select } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";
import type {
  ActionDashboardCard,
  ActionParametersMapping,
  Dashboard,
  Parameter,
  ParameterTarget,
  WritebackAction,
  WritebackParameter,
} from "metabase-types/api";

import {
  ParameterFormBadge,
  ParameterFormLabel,
  ParameterFormSection,
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
          null, // this is irrelevant for action parameters
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
const ASK_VALUE = "ask the user";

export const ActionParameterMappingItem = ({
  action,
  actionParameter,
  mappedValue,
  dashboardParameters,
  onChange,
}: ActionParameterMappingItemProps) => {
  const [value, setValue] = useState<string>(mappedValue ?? ASK_VALUE);

  const isHidden = isParameterHidden(action, actionParameter);
  const isRequired = isParameterRequired(action, actionParameter);
  const defaultValue = getParameterDefaultValue(action, actionParameter);
  const isParameterMapped = mappedValue != null;
  const hasDefaultValue = defaultValue != null;
  const showError =
    isHidden && isRequired && !isParameterMapped && !hasDefaultValue;
  const name = actionParameter.name ?? actionParameter.id;

  const handleChange = (selected: string | null) => {
    const nextValue = selected ?? ASK_VALUE;

    setValue(nextValue);

    const isMappedToParameter =
      nextValue !== DEFAULT_VALUE && nextValue !== ASK_VALUE;

    onChange(isMappedToParameter ? nextValue : null, actionParameter.target);
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
        data-testid="parameter-mapping-select"
        value={value}
        comboboxProps={{ width: 300, position: "bottom-start" }}
        onChange={handleChange}
        data={[
          ...getDefaultOptions({
            isRequired,
            isHidden,
            hasDefaultValue,
            defaultValue,
          }),
          ...dashboardParameters.map((dashboardParam) => ({
            value: dashboardParam.id,
            label: dashboardParam.name,
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
  const defaultOptions = [
    {
      value: ASK_VALUE,
      label: isHidden ? t`Select a value` : t`Ask the user`,
    },
  ];

  if (isHidden && isRequired && hasDefaultValue) {
    defaultOptions.push({
      value: DEFAULT_VALUE,
      label: String(defaultValue),
    });
  }

  return defaultOptions;
}
