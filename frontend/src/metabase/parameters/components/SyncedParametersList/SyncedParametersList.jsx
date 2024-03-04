import PropTypes from "prop-types";
import { useMemo } from "react";

import { useSyncedQueryString } from "metabase/hooks/use-synced-query-string";
import ParametersList from "metabase/parameters/components/ParametersList";
import { getParameterValuesBySlug } from "metabase-lib/parameters/utils/parameter-values";

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
    () => getParameterValuesBySlug(parameters, undefined, dashboard.id),
    [dashboard.id, parameters],
  );

  const localParametersStringified = window.localStorage.getItem(
    "dashboardParameters",
  );

  const parametersWithLocalValues = useMemo(() => {
    const localParameters = localParametersStringified
      ? JSON.parse(localParametersStringified)
      : {};

    const localDashboardParameters = localParameters[dashboard.id] ?? {};

    return parameters.map(parameter => {
      return parameter.value
        ? parameter
        : {
            ...parameter,
            // if there is recently used value, use it
            value: localDashboardParameters[parameter.id] ?? null,
          };
    });
  }, [dashboard.id, localParametersStringified, parameters]);

  return (
    <ParametersList
      className={className}
      parameters={parametersWithLocalValues}
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
