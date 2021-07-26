import React, { useState } from "react";
import PropTypes from "prop-types";
import {
  LegendContent,
  LegendPanel,
  LegendContainerRoot,
} from "./LegendContainer.styled";
import Legend from "./Legend";

const propTypes = {
  className: PropTypes.string,
  showLegend: PropTypes.bool,
  children: PropTypes.node,
};

const LegendContainer = props => {
  const { className, showLegend, children, ...legendProps } = props;
  const [isVertical, setIsVertical] = useState(false);

  return (
    <LegendContainerRoot className={className}>
      {showLegend && (
        <LegendPanel>
          <Legend
            {...legendProps}
            isVertical={isVertical}
            onOrientationChange={setIsVertical}
          />
        </LegendPanel>
      )}
      <LegendContent>{children}</LegendContent>
    </LegendContainerRoot>
  );
};

LegendContainer.propTypes = propTypes;

export default LegendContainer;
