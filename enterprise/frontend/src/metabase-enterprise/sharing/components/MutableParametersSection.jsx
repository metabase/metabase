/* eslint "react/prop-types": 2 */

import cx from "classnames";
import PropTypes from "prop-types";
import { t } from "ttag";
import _ from "underscore";

import CollapseSection from "metabase/components/CollapseSection";
import CS from "metabase/css/core/index.css";
import { getPulseParameters } from "metabase/lib/pulse";
import ParametersList from "metabase/parameters/components/ParametersList";
import {
  getDefaultValuePopulatedParameters,
  PULSE_PARAM_USE_DEFAULT,
} from "metabase-lib/v1/parameters/utils/parameter-values";

function MutableParametersSection({
  className,
  parameters,
  dashboard,
  pulse,
  setPulseParameters,
}) {
  const pulseParameters = getPulseParameters(pulse);
  const pulseParamValuesById = pulseParameters.reduce((map, parameter) => {
    map[parameter.id] = parameter.value;
    return map;
  }, {});

  const valuePopulatedParameters = getDefaultValuePopulatedParameters(
    parameters,
    pulseParamValuesById,
  );

  const setParameterValue = (id, value) => {
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
      data-testid="subscription-parameters-section"
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
}

MutableParametersSection.propTypes = {
  className: PropTypes.string,
  parameters: PropTypes.array.isRequired,
  dashboard: PropTypes.object.isRequired,
  pulse: PropTypes.object.isRequired,
  setPulseParameters: PropTypes.func.isRequired,
};

export default MutableParametersSection;
