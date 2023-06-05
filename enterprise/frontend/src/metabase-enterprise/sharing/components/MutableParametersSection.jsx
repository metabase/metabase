/* eslint "react/prop-types": 2 */

import PropTypes from "prop-types";

import _ from "underscore";
import cx from "classnames";
import { t } from "ttag";

import CollapseSection from "metabase/components/CollapseSection";
import ParametersList from "metabase/parameters/components/ParametersList";

import {
  getPulseParameters,
  getActivePulseParameters,
} from "metabase/lib/pulse";
import { getValuePopulatedParameters } from "metabase-lib/parameters/utils/parameter-values";

function MutableParametersSection({
  className,
  parameters,
  defaultParametersById,
  dashboard,
  pulse,
  setPulseParameters,
}) {
  const pulseParameters = getPulseParameters(pulse);
  const activeParameters = getActivePulseParameters(pulse, parameters);
  const pulseParamValuesById = activeParameters.reduce((map, parameter) => {
    map[parameter.id] = parameter.value;
    return map;
  }, {});

  const valuePopulatedParameters = getValuePopulatedParameters(
    parameters,
    pulseParamValuesById,
  );

  const setParameterValue = (id, value) => {
    const parameter = parameters.find(parameter => parameter.id === id);
    const filteredParameters = pulseParameters.filter(
      parameter => parameter.id !== id,
    );
    const newParameters =
      value == null
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
      bodyClass="mt2"
    >
      <ParametersList
        className="align-stretch row-gap-1"
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
  defaultParametersById: PropTypes.object.isRequired,
  dashboard: PropTypes.object.isRequired,
  pulse: PropTypes.object.isRequired,
  setPulseParameters: PropTypes.func.isRequired,
};

export default MutableParametersSection;
