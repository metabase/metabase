import PropTypes from "prop-types";

import { useSyncedQueryString } from "metabase/hooks/use-synced-query-string";
import ParametersList from "metabase/parameters/components/ParametersList";
import { getParameterValuesBySlug } from "metabase-lib/v1/parameters/utils/parameter-values";

const propTypes = {
  parameters: PropTypes.array.isRequired,
  editingParameter: PropTypes.object,
  question: PropTypes.object,
  dashboard: PropTypes.object,

  className: PropTypes.string,
  hideParameters: PropTypes.string,

  isFullscreen: PropTypes.bool,
  isNightMode: PropTypes.bool,
  isEditing: PropTypes.bool,
  commitImmediately: PropTypes.bool,

  setParameterValue: PropTypes.func,
  setParameterIndex: PropTypes.func,
  setEditingParameter: PropTypes.func,
  setParameterValueToDefault: PropTypes.func,
  enableParameterRequiredBehavior: PropTypes.bool,
};

export function SyncedParametersList({
  parameters,
  editingParameter,
  question,
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
  setParameterValueToDefault,
  enableParameterRequiredBehavior,
}) {
  useSyncedQueryString(
    () => getParameterValuesBySlug(parameters),
    [parameters],
  );

  return (
    <ParametersList
      className={className}
      parameters={parameters}
      question={question}
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
      setParameterValueToDefault={setParameterValueToDefault}
      enableParameterRequiredBehavior={enableParameterRequiredBehavior}
    />
  );
}

SyncedParametersList.propTypes = propTypes;

export default SyncedParametersList;
