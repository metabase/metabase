import cx from "classnames";
import { useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import CollapseSection from "metabase/components/CollapseSection";
import CS from "metabase/css/core/index.css";
import { getPulseParameters } from "metabase/lib/pulse";
import { ParametersList } from "metabase/parameters/components/ParametersList";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import {
  PULSE_PARAM_USE_DEFAULT,
  getDefaultValuePopulatedParameters,
} from "metabase-lib/v1/parameters/utils/parameter-values";
import type { Dashboard, ParameterId, Pulse } from "metabase-types/api";

export type MutableParametersSectionProps = {
  className?: string;
  parameters: UiParameter[];
  dashboard: Dashboard;
  pulse: Pulse;
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
  const pulseParameters = getPulseParameters(pulse);
  const pulseParamValuesById = pulseParameters.reduce((map, parameter) => {
    map[parameter.id] = parameter.value;
    return map;
  }, {});

  const valuePopulatedParameters = getDefaultValuePopulatedParameters(
    parameters,
    pulseParamValuesById,
  );

  const setParameterValue = (id: ParameterId, value: any) => {
    const parameter = parameters.find(parameter => parameter.id === id);
    const filteredParameters = pulseParameters.filter(
      parameter => parameter.id !== id,
    );
    const newParameters =
      value === PULSE_PARAM_USE_DEFAULT
        ? filteredParameters
        : filteredParameters.concat({
            ...parameter,
            value,
          });

    setPulseParameters(newParameters);
  };

  const connectedParameters = useMemo(() => {
    return parameters.filter(parameter => {
      if ("fields" in parameter) {
        return parameter.fields?.length > 0;
      }
      return false;
    });
  }, [parameters]);

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
        dashboard={dashboard}
        parameters={valuePopulatedParameters}
        hideParameters={hiddenParameters}
        setParameterValue={setParameterValue}
      />
    </CollapseSection>
  );
};
