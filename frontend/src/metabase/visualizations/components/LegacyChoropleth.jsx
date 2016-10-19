import React, { Component, PropTypes } from "react";

import { isSameSeries } from "metabase/visualizations/lib/utils";
import d3 from "d3";

const LegacyChoropleth = ({ series, geoJson, projection, getColor, onHoverFeature }) => {
    let geo = d3.geo.path()
        .projection(projection);

    let translate = projection.translate();
    let width = translate[0] * 2;
    let height = translate[1] * 2;

    return (
        <div className="absolute top bottom left right flex layout-centered">
            <ShouldUpdate series={series} shouldUpdate={(props, nextProps) => !isSameSeries(props.series, nextProps.series)}>
                { () =>  // eslint-disable-line react/display-name
                    <svg className="flex-full m1" viewBox={`0 0 ${width} ${height}`}>
                    {geoJson.features.map((feature, index) =>
                        <path
                            d={geo(feature, index)}
                            stroke="white"
                            strokeWidth={1}
                            fill={getColor(feature)}
                            onMouseMove={(e) => onHoverFeature({
                                feature: feature,
                                event: e.nativeEvent
                            })}
                            onMouseLeave={() => onHoverFeature(null)}
                        />
                    )}
                    </svg>
                }
            </ShouldUpdate>
        </div>
    );
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


export default LegacyChoropleth;
