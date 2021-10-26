import React from "react";
import PropTypes from "prop-types";

import ParametersList from "metabase/parameters/components/ParametersList";
import { useSyncedQuerystringParameterValues } from "metabase/parameters/hooks/use-synced-querystring-parameter-values";

const propTypes = {
  parameters: PropTypes.array.isRequired,
  editingParameter: PropTypes.object,
  dashboard: PropTypes.object,

  className: PropTypes.string,
  hideParameters: PropTypes.string,

  isFullscreen: PropTypes.bool,
  isNightMode: PropTypes.bool,
  isEditing: PropTypes.bool,
  commitImmediately: PropTypes.bool,

  setParameterValue: PropTypes.func.isRequired,
  setParameterIndex: PropTypes.func,
  setEditingParameter: PropTypes.func,
};

export function Parameters({
  parameters,
  editingParameter,
  dashboard,

  className,
  hideParameters,

  isFullscreen,
  isNightMode,
  isEditing,
  commitImmediately,

  setParameterValue,
  setParameterIndex,
  setEditingParameter,
}) {
  useSyncedQuerystringParameterValues({
    parameters,
    dashboard,
  });

  return (
    <ParametersList
      className={className}
      parameters={parameters}
      dashboard={dashboard}
      editingParameter={editingParameter}
      isFullscreen={isFullscreen}
      isNightMode={isNightMode}
      hideParameters={hideParameters}
      isEditing={isEditing}
      commitImmediately={commitImmediately}
      setParameterValue={setParameterValue}
      setParameterIndex={setParameterIndex}
      setEditingParameter={setEditingParameter}
    />
  );
}

Parameters.propTypes = propTypes;

export default Parameters;
