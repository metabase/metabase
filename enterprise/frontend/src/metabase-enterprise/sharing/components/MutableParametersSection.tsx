import cx from "classnames";
import { useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import { CollapseSection } from "metabase/common/components/CollapseSection";
import CS from "metabase/css/core/index.css";
import { getPulseParameters } from "metabase/lib/pulse";
import { ParametersList } from "metabase/parameters/components/ParametersList";
import { getVisibleParameters } from "metabase/parameters/utils/ui";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import { deriveFieldOperatorFromParameter } from "metabase-lib/v1/parameters/utils/operators";
import {
  PULSE_PARAM_USE_DEFAULT,
  getDefaultValuePopulatedParameters,
} from "metabase-lib/v1/parameters/utils/parameter-values";
import type {
  Dashboard,
  DashboardSubscription,
  Parameter,
  ParameterId,
} from "metabase-types/api";

import { getSortedParameters } from "./utils";

export type MutableParametersSectionProps = {
  className?: string;
  parameters: UiParameter[];
  dashboard: Dashboard;
  pulse: DashboardSubscription;
  setPulseParameters: (parameters: UiParameter[]) => void;
  hiddenParameters?: string;
};

export const MutableParametersSection = ({
  className,
  parameters,
  dashboard,
  pulse,
  setPulseParameters,
  hiddenParameters,
}: MutableParametersSectionProps) => {
  const sortedParameters = useMemo(() => {
    return getSortedParameters(dashboard, parameters);
  }, [parameters, dashboard]);

  const pulseParameters = getPulseParameters(pulse);
  const pulseParamValuesById = pulseParameters.reduce(
    (map, parameter) => {
      map[parameter.id] = parameter.value;
      return map;
    },
    {} as Record<string, Parameter["value"]>,
  );

  const valuePopulatedParameters = getDefaultValuePopulatedParameters(
    sortedParameters,
    pulseParamValuesById,
  );

  const setParameterValue = (id: ParameterId, value: Parameter["value"]) => {
    const parameter = sortedParameters.find((parameter) => parameter.id === id);
    if (!parameter) {
      return;
    }
    const operator = deriveFieldOperatorFromParameter(parameter);
    const filteredParameters = pulseParameters.filter(
      (parameter) => parameter.id !== id,
    );
    const newParameter: Parameter = {
      ...parameter,
      value: value,
      options: operator?.optionsDefaults,
    };
    const newParameters =
      value === PULSE_PARAM_USE_DEFAULT
        ? filteredParameters
        : filteredParameters.concat(newParameter);

    setPulseParameters(newParameters);
  };

  const connectedParameters = useMemo(() => {
    return getVisibleParameters(sortedParameters, hiddenParameters);
  }, [sortedParameters, hiddenParameters]);

  return _.isEmpty(connectedParameters) ? null : (
    <CollapseSection
      header={<h4>{t`Set filter values for when this gets sent`}</h4>}
      className={cx(className)}
      initialState="expanded"
      bodyClass={CS.mt2}
      data-testid="subscription-parameters-section"
    >
      <ParametersList
        className={cx(CS.alignStretch, CS.rowGap1)}
        vertical
        dashboardId={dashboard?.id}
        parameters={valuePopulatedParameters}
        hideParameters={hiddenParameters}
        setParameterValue={setParameterValue}
      />
    </CollapseSection>
  );
};
