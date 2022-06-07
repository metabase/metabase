/* eslint-disable react/prop-types */
import React from "react";
import cx from "classnames";

import ParameterWidget from "./ParameterWidget";
import { getVisibleParameters } from "metabase/parameters/utils/ui";

function ParametersList({
  className,

  parameters,
  dashboard,

  isFullscreen,
  isNightMode,
  hideParameters,
  vertical,
  commitImmediately,

  setParameterValue,
}) {
  const visibleValuePopulatedParameters = getVisibleParameters(
    parameters,
    hideParameters,
  );

  return visibleValuePopulatedParameters.length > 0 ? (
    <div
      className={cx(
        className,
        "flex align-end flex-wrap",
        vertical ? "flex-column" : "flex-row",
      )}
    >
      {visibleValuePopulatedParameters.map((valuePopulatedParameter, index) => (
        <ParameterWidget
          key={valuePopulatedParameter.id}
          className={cx({ mb2: vertical })}
          isFullscreen={isFullscreen}
          isNightMode={isNightMode}
          parameter={valuePopulatedParameter}
          parameters={parameters}
          dashboard={dashboard}
          setValue={
            setParameterValue &&
            (value => setParameterValue(valuePopulatedParameter.id, value))
          }
          commitImmediately={commitImmediately}
        />
      ))}
    </div>
  ) : null;
}

ParametersList.defaultProps = {
  vertical: false,
  commitImmediately: false,
};

export default ParametersList;
