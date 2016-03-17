import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";

import LoadingSpinner from "metabase/components/LoadingSpinner.jsx";

import { isString } from "metabase/lib/schema_metadata";
import { MinColumnsError } from "metabase/visualizations/lib/errors";

import { formatNumber } from "metabase/lib/formatting";
import { isSameSeries } from "metabase/visualizations/lib/utils";

import ChartWithLegend from "./ChartWithLegend.jsx";
import ChartTooltip from "./ChartTooltip.jsx";

import d3 from "d3";

// const HEAT_MAP_COLORS = [
//     "#E1F2FF",
//     "#67B9FF",
//     "#2DA0FF",
//     "#0A93FF",
//     "#005FB8"
// ];
// const HEAT_MAP_ZERO_COLOR = '#CCC';

const HEAT_MAP_COLORS = [
    // "#E2F2FF",
    "#C4E4FF",
    // "#9ED2FF",
    "#81C5FF",
    // "#6BBAFF",
    "#51AEFF",
    // "#36A2FF",
    "#1E96FF",
    // "#0089FF",
    "#0061B5"
];
const HEAT_MAP_ZERO_COLOR = '#CCC';

export default class ChoroplethMap extends Component {
    static propTypes = {
        geoJsonPath: PropTypes.string.isRequired,
        projection: PropTypes.object.isRequired,
        getRowKey: PropTypes.func.isRequired,
        getRowValue: PropTypes.func.isRequired,
        getFeatureKey: PropTypes.func.isRequired,
        getFeatureName: PropTypes.func.isRequired
    };

    static minSize = { width: 4, height: 4 };

    static isSensible(cols, rows) {
        return cols.length > 1 && isString(cols[0]);
    }

    static checkRenderable(cols, rows) {
        if (cols.length < 2) { throw new MinColumnsError(2, cols.length); }
    }

    constructor(props, context) {
        super(props, context);
        this.state = {
            features: null
        };
    }

    componentWillMount() {
        d3.json(this.props.geoJsonPath, (json) => {
            this.setState({ features: json.features });
        });
    }

    render() {
        const {
            series,
            className,
            gridSize,
            hovered, onHoverChange,
            projection,
            getRowKey, getRowValue,
            getFeatureKey, getFeatureName
        } = this.props;

        const { features } = this.state;

        if (!features) {
            return (
                <div className={className + " flex layout-centered"}>
                    <LoadingSpinner />
                </div>
            );
        }

        const getFeatureValue = (feature) => valuesMap[getFeatureKey(feature)]

        let rows = series[0].data.rows;

        let valuesMap = {};
        for (let row of rows) {
            valuesMap[getRowKey(row)] = (valuesMap[row[0]] || 0) + getRowValue(row);
        }

        var colorScale = d3.scale.quantize().domain(d3.extent(rows, d => d[1])).range(HEAT_MAP_COLORS);

        let legendColors = HEAT_MAP_COLORS.slice();
        let legendTitles = HEAT_MAP_COLORS.map((color, index) => {
            let [min, max] = colorScale.invertExtent(color);
            return index === HEAT_MAP_COLORS.length - 1 ?
                formatNumber(min) + " +" :
                formatNumber(min) + " - " + formatNumber(max)
        });

        const getColor = (feature) => {
            let value = getFeatureValue(feature);
            return value == null ? HEAT_MAP_ZERO_COLOR : colorScale(value);
        }

        let geo = d3.geo.path()
            .projection(projection);

        let translate = projection.translate();
        let width = translate[0] * 2;
        let height = translate[1] * 2;

        return (
            <ChartWithLegend
                className={className}
                aspectRatio={width / height}
                legendTitles={legendTitles} legendColors={legendColors}
                gridSize={gridSize}
                hovered={hovered} onHoverChange={onHoverChange}
            >
                <div className="absolute top bottom left right flex layout-centered">
                    <ShouldUpdate series={series} shouldUpdate={(props, nextProps) => !isSameSeries(props.series, nextProps.series)}>
                        { () =>
                            <svg className="flex-full m1" viewBox={`0 0 ${width} ${height}`}>
                            {features && features.map((feature, index) =>
                                <path
                                    d={geo(feature, index)}
                                    fill={getColor(feature)}
                                    onMouseMove={(e) => onHoverChange && onHoverChange({
                                        index: HEAT_MAP_COLORS.indexOf(getColor(feature)),
                                        event: e.nativeEvent,
                                        data: { key: getFeatureName(feature), value: getFeatureValue(feature)
                                    } })}
                                    onMouseLeave={() => onHoverChange && onHoverChange(null)}
                                />
                            )}
                            </svg>
                        }
                    </ShouldUpdate>
                </div>
                <ChartTooltip series={series} hovered={hovered} />
            </ChartWithLegend>
        );
    }
}

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
