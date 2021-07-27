import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  ChartContent,
  LegendContent,
  ChartWithLegendRoot,
} from "./ChartWithLegend.styled";
import Legend from "./Legend";

const MIN_WIDTH_PER_SERIES = 100;
const MIN_UNITS_PER_LEGEND = 6;

type Props = {
  className?: string,
  titles: string[],
  gridSize?: GridSize,
  showLegend?: boolean,
  isDashboard?: boolean,
  children?: React.ReactNode,
};

type GridSize = {
  width: number,
  height: number,
};

const ChartWithLegend = (props: Props) => {
  const {
    className,
    titles,
    gridSize,
    showLegend,
    isDashboard,
    children,
    ...legendProps
  } = props;
  const ref = useRef();
  const [isVertical, setIsVertical] = useState(false);

  const seriesCount = titles.length;
  const isCompact = gridSize != null && gridSize.width < MIN_UNITS_PER_LEGEND;
  const isVisible = !isDashboard || !(isCompact && isVertical);

  const handleResize = useCallback(
    width => {
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
      {showLegend && isVisible && (
        <LegendContent isVertical={isVertical}>
          <Legend {...legendProps} titles={titles} isVertical={isVertical} />
        </LegendContent>
      )}
      <ChartContent>{children}</ChartContent>
    </ChartWithLegendRoot>
  );
};

export default ChartWithLegend;
