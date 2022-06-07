import React from "react";
import PropTypes from "prop-types";

import ParametersList from "metabase/parameters/components/ParametersList";
import { getParameterValuesBySlug } from "metabase/parameters/utils/parameter-values";
import { useSyncedQueryString } from "metabase/hooks/use-synced-query-string";

const propTypes = {
  parameters: PropTypes.array.isRequired,
  dashboard: PropTypes.object,

  className: PropTypes.string,
  hideParameters: PropTypes.string,

  isFullscreen: PropTypes.bool,
  isNightMode: PropTypes.bool,
  commitImmediately: PropTypes.bool,

  setParameterValue: PropTypes.func,
};

export function SyncedParametersList({
  parameters,
  dashboard,

  className,
  hideParameters,

  isFullscreen,
  isNightMode,
  commitImmediately,

  setParameterValue,
}) {
  useSyncedQueryString(
    () =>
      getParameterValuesBySlug(
        parameters,
        undefined,
        dashboard && { preserveDefaultedParameters: true },
      ),
    [parameters, dashboard],
  );

  return (
    <ParametersList
      className={className}
      parameters={parameters}
      dashboard={dashboard}
      isFullscreen={isFullscreen}
      isNightMode={isNightMode}
      hideParameters={hideParameters}
      commitImmediately={commitImmediately}
      setParameterValue={setParameterValue}
    />
  );
}

SyncedParametersList.propTypes = propTypes;

export default SyncedParametersList;
