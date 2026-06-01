/* eslint-disable react/prop-types */
import cx from "classnames";
import * as d3 from "d3";
import { Component } from "react";

import CS from "metabase/css/core/index.css";
import { animateMentionHighlightStroke } from "metabase/visualizations/lib/mention-highlight";
import { isSameSeries } from "metabase/visualizations/lib/utils";

/** @type {string | null | undefined} */
const DEFAULT_SELECTED_FEATURE_KEY = null;

/** @type {(feature: import("geojson").Feature) => string | null} */
const getDefaultFeatureKey = () => null;

/**
 * @param {{
 *   series: unknown,
 *   geoJson: any,
 *   projection: any,
 *   projectionFrame: any,
 *   getColor: (feature: any) => string,
 *   onHoverFeature?: (hoveredFeature: any) => void,
 *   onClickFeature?: ((clickedFeature: any) => void) | null,
 *   selectedFeatureKey?: string | null,
 *   selectedFeatureViaMention?: boolean,
 *   getFeatureKey?: (feature: any) => string | null,
 * }} props
 */
export const LegacyChoropleth = ({
  series,
  geoJson,
  projection,
  projectionFrame,
  getColor,
  onHoverFeature,
  onClickFeature,
  selectedFeatureKey = DEFAULT_SELECTED_FEATURE_KEY,
  selectedFeatureViaMention = false,
  getFeatureKey = getDefaultFeatureKey,
}) => {
  const geo = d3.geoPath().projection(projection);

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
        selectedFeatureKey={selectedFeatureKey}
        selectedFeatureViaMention={selectedFeatureViaMention}
        shouldUpdate={(props, nextProps) =>
          !isSameSeries(props.series, nextProps.series) ||
          props.selectedFeatureKey !== nextProps.selectedFeatureKey ||
          props.selectedFeatureViaMention !==
            nextProps.selectedFeatureViaMention
        }
      >
        {() => (
          <svg
            className={cx(CS.flexFull, CS.m1)}
            viewBox={`${minX} ${minY} ${width} ${height}`}
          >
            {geoJson.features.map((feature, index) => {
              const isMentionSelected =
                selectedFeatureKey &&
                selectedFeatureViaMention &&
                getFeatureKey(feature) === selectedFeatureKey;
              return (
                <path
                  data-testid="choropleth-feature"
                  key={index}
                  ref={
                    isMentionSelected
                      ? (el) => el && animateMentionHighlightStroke(el, 3)
                      : undefined
                  }
                  d={geo(feature, index)}
                  stroke={isMentionSelected ? "var(--mb-color-brand)" : "white"}
                  strokeWidth={
                    selectedFeatureKey &&
                    getFeatureKey(feature) === selectedFeatureKey
                      ? 3
                      : 1
                  }
                  opacity={
                    selectedFeatureKey &&
                    getFeatureKey(feature) !== selectedFeatureKey
                      ? 0.3
                      : 1
                  }
                  fill={getColor(feature)}
                  onMouseMove={(e) =>
                    onHoverFeature({
                      feature: feature,
                      event: e.nativeEvent,
                    })
                  }
                  onMouseLeave={() => onHoverFeature(null)}
                  className={cx({ [CS.cursorPointer]: !!onClickFeature })}
                  onClick={
                    onClickFeature
                      ? (e) =>
                          onClickFeature({
                            feature: feature,
                            event: e.nativeEvent,
                          })
                      : undefined
                  }
                />
              );
            })}
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
