/* eslint-disable react/prop-types */
import cx from "classnames";
import d3 from "d3";
import { Component } from "react";

import CS from "metabase/css/core/index.css";
import { isSameSeries } from "metabase/visualizations/lib/utils";

const LegacyChoropleth = ({
  series,
  geoJson,
  projection,
  projectionFrame,
  getColor,
  onHoverFeature,
  onClickFeature,
}) => {
  const geo = d3.geo.path().projection(projection);

  const [[minX, minY], [maxX, maxY]] = projectionFrame.map(projection);
  const width = maxX - minX;
  const height = maxY - minY;

  return (
    <div
      className={cx(
        CS.absolute,
        CS.top,
        CS.bottom,
        CS.left,
        CS.right,
        CS.flex,
        CS.layoutCentered,
      )}
    >
      <ShouldUpdate
        series={series}
        shouldUpdate={(props, nextProps) =>
          !isSameSeries(props.series, nextProps.series)
        }
      >
        {() => (
          <svg
            className={cx(CS.flexFull, CS.m1)}
            viewBox={`${minX} ${minY} ${width} ${height}`}
          >
            {geoJson.features.map((feature, index) => (
              <path
                data-testid="choropleth-feature"
                key={index}
                d={geo(feature, index)}
                stroke="white"
                strokeWidth={1}
                fill={getColor(feature)}
                onMouseMove={e =>
                  onHoverFeature({
                    feature: feature,
                    event: e.nativeEvent,
                  })
                }
                onMouseLeave={() => onHoverFeature(null)}
                className={cx({ [CS.cursorPointer]: !!onClickFeature })}
                onClick={
                  onClickFeature
                    ? e =>
                        onClickFeature({
                          feature: feature,
                          event: e.nativeEvent,
                        })
                    : undefined
                }
              />
            ))}
          </svg>
        )}
      </ShouldUpdate>
    </div>
  );
};

class ShouldUpdate extends Component {
  shouldComponentUpdate(nextProps) {
    if (nextProps.shouldUpdate) {
      return nextProps.shouldUpdate(this.props, nextProps);
    }
    return true;
  }
  render() {
    const { children } = this.props;
    if (typeof children === "function") {
      return children();
    } else {
      return children;
    }
  }
}

export default LegacyChoropleth;
