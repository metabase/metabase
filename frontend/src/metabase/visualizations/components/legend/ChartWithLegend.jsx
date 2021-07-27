import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import PropTypes from "prop-types";
import {
  ChartContent,
  LegendContent,
  ChartWithLegendRoot,
} from "./ChartWithLegend.styled";
import Legend from "./Legend";

const MIN_WIDTH_PER_SERIES = 100;
const MIN_WIDTH_PER_LEGEND = 400;

const propTypes = {
  titles: PropTypes.array,
  showLegend: PropTypes.bool,
  children: PropTypes.node,
  className: PropTypes.string,
  ...Legend.propTypes,
};

const ChartWithLegend = props => {
  const { titles, showLegend, children, className, ...legendProps } = props;
  const seriesCount = titles.length;

  const ref = useRef();
  const [isVisible, setIsVisible] = useState(false);
  const [isVertical, setIsVertical] = useState(false);

  const handleResize = useCallback(
    width => {
      setIsVisible(width < MIN_WIDTH_PER_LEGEND);
      setIsVertical(width < seriesCount * MIN_WIDTH_PER_SERIES);
    },
    [seriesCount],
  );

  useLayoutEffect(() => {
    const { width } = ref.current.getBoundingClientRect();
    handleResize(width);
  }, [handleResize]);

  useEffect(() => {
    const observer = new ResizeObserver(entries => {
      const { width } = entries[0].contentRect;
      handleResize(width);
    });

    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [handleResize]);

  return (
    <ChartWithLegendRoot
      innerRef={ref}
      className={className}
      isVertical={isVertical}
    >
      {showLegend && !isVisible && (
        <LegendContent isVertical={isVertical}>
          <Legend {...legendProps} titles={titles} isVertical={isVertical} />
        </LegendContent>
      )}
      <ChartContent>{children}</ChartContent>
    </ChartWithLegendRoot>
  );
};

ChartWithLegend.propTypes = propTypes;

export default ChartWithLegend;
