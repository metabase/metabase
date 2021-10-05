import React from "react";
import PropTypes from "prop-types";

import { getValuePopulatedParameters } from "metabase/meta/Parameter";
import Parameters from "metabase/parameters/components/Parameters/Parameters";

const propTypes = {
  dashboard: PropTypes.object,
  editingParameter: PropTypes.bool,
  hideParameters: PropTypes.any,
  isEditing: PropTypes.bool.isRequired,
  isFullscreen: PropTypes.bool.isRequired,
  location: PropTypes.object,
  parameterValues: PropTypes.object,
  parameters: PropTypes.array,
  setEditingParameter: PropTypes.func,
  setParameterIndex: PropTypes.func,
  setParameterValue: PropTypes.func,
  shouldRenderAsNightMode: PropTypes.bool.isRequired,
};

const ParametersWidget = ({
  dashboard,
  editingParameter,
  hideParameters,
  isEditing,
  isFullscreen,
  location,
  parameterValues,
  parameters,
  setEditingParameter,
  setParameterIndex,
  setParameterValue,
  shouldRenderAsNightMode,
}) => {
  return parameters?.length > 0 ? (
    <Parameters
      syncQueryString
      dashboard={dashboard}
      isEditing={isEditing}
      isFullscreen={isFullscreen}
      isNightMode={shouldRenderAsNightMode}
      hideParameters={hideParameters}
      parameters={getValuePopulatedParameters(parameters, parameterValues)}
      query={location.query}
      editingParameter={editingParameter}
      setEditingParameter={setEditingParameter}
      setParameterIndex={setParameterIndex}
      setParameterValue={setParameterValue}
    />
  ) : null;
};

ParametersWidget.propTypes = propTypes;

export default ParametersWidget;
