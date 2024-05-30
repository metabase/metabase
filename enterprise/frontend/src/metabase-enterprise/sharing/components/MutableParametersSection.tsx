import cx from "classnames";
import { t } from "ttag";
import _ from "underscore";

import CollapseSection from "metabase/components/CollapseSection";
import CS from "metabase/css/core/index.css";
import { getPulseParameters } from "metabase/lib/pulse";
import { ParametersList } from "metabase/parameters/components/ParametersList";
import {
  getDefaultValuePopulatedParameters,
  PULSE_PARAM_USE_DEFAULT,
} from "metabase-lib/v1/parameters/utils/parameter-values";
import type {
  Dashboard,
  Parameter,
  ParameterId,
  Pulse,
} from "metabase-types/api";

type MutableParametersSectionProps = {
  className?: string;
  parameters: Parameter[];
  dashboard: Dashboard;
  pulse: Pulse;
  setPulseParameters: (parameters: Parameter[]) => void;
};

export const MutableParametersSection = ({
  className,
  parameters,
  dashboard,
  pulse,
  setPulseParameters,
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

  return _.isEmpty(parameters) ? null : (
    <CollapseSection
      header={<h4>{t`Set filter values for when this gets sent`}</h4>}
      className={cx(className)}
      initialState="expanded"
      bodyClass={CS.mt2}
    >
      <ParametersList
        className={cx(CS.alignStretch, CS.rowGap1)}
        vertical
        dashboard={dashboard}
        parameters={valuePopulatedParameters}
        setParameterValue={setParameterValue}
      />
    </CollapseSection>
  );
};
