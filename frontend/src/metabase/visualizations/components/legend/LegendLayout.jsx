import React, { useLayoutEffect, useRef, useState } from "react";
import PropTypes from "prop-types";
import {
  ChartPanel,
  LegendLayoutRoot,
  LegendPanel,
} from "./LegendLayout.styled";
import Legend from "metabase/visualizations/components/legend/Legend";

const MIN_UNITS_PER_LEGEND = 6;

const propTypes = {
  className: PropTypes.string,
  gridSize: PropTypes.object,
  showLegend: PropTypes.bool,
  isDashboard: PropTypes.bool,
  children: PropTypes.node,
  ...Legend.propTypes,
};

const LegendLayout = ({
  className,
  gridSize,
  showLegend,
  isDashboard,
  children,
  ...otherProps
}) => {
  const ref = useRef();
  const [isMeasured, setIsMeasured] = useState(false);
  const [isVertical, setIsVertical] = useState(false);

  const gridWidth = gridSize && gridSize.width;
  const isCompact = gridWidth < MIN_UNITS_PER_LEGEND;
  const isHidden = isVertical && isCompact && isDashboard;
  const isVisible = showLegend && !isHidden;

  useLayoutEffect(() => {
    if (showLegend) {
      setIsMeasured(false);
      setIsVertical(false);
    }
  }, [gridWidth, showLegend]);

  useLayoutEffect(() => {
    const legend = ref.current;

    if (legend && !isMeasured) {
      setIsVertical(legend.scrollWidth > legend.offsetWidth);
      setIsMeasured(true);
    }
  }, [isMeasured]);

  return (
    <LegendLayoutRoot className={className} isVertical={isVertical}>
      {isVisible && (
        <LegendPanel isVertical={isVertical}>
          <Legend ref={ref} isVertical={isVertical} {...otherProps} />
        </LegendPanel>
      )}
      <ChartPanel>{children}</ChartPanel>
    </LegendLayoutRoot>
  );
};

LegendLayout.propTypes = propTypes;

export default LegendLayout;
