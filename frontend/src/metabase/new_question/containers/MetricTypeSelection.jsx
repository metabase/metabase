import cxs from "cxs";
import React, { Component } from "react";
import { connect } from "react-redux";

import Surface from "metabase/components/Surface";
import ResponsiveList from "metabase/components/ResponsiveList";

import { selectAndAdvance, selectFlow } from "../actions";

import { normal } from "metabase/lib/colors";

const mapDispatchToProps = {
    selectAndAdvance,
    selectFlow
};

const { blue, yellow, green, purple } = normal;

const METRIC_TYPES = [
    { name: "Numbers", color: blue, type: "metric" },
    { name: "Pivots", color: green, type: "pivot" },
    { name: "Time", color: yellow, type: "timeseries" }
    // { name: 'Maps', color: purple, type: 'geo' }
];

@connect(() => ({}), mapDispatchToProps)
class MetricTypeSelection extends Component {
    render() {
        const { selectAndAdvance, selectFlow } = this.props;
        return (
            <ResponsiveList
                items={METRIC_TYPES}
                onClick={({ type }) => selectAndAdvance(() => selectFlow(type))}
                cardDisplay={metric => (
                    <Surface>
                        <div
                            className={cxs({
                                display: "flex",
                                flexDirection: "column",
                                minHeight: 320,
                                overflow: "hidden"
                            })}
                        >
                            <div
                                className={cxs({
                                    backgroundColor: metric.color,
                                    flex: "0 80%",
                                    height: "100%"
                                })}
                            >
                                thing
                            </div>
                            <div
                                className={cxs({
                                    padding: "2em",
                                    textAlign: "center"
                                })}
                            >
                                <h2>{metric.name}</h2>
                            </div>
                        </div>
                    </Surface>
                )}
            />
        );
    }
}

export default MetricTypeSelection;
