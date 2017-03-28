import cxs from "cxs";
import React, { Component } from "react";
import { connect } from "react-redux";

import { normal } from "metabase/lib/colors";
import { selectFlow } from "../actions";

const queryTypes = [
    { name: "A metric", type: "metric", color: normal.blue },
    { name: "A metric on a map", type: "geo", color: normal.green },
    { name: "Pivot a metric", type: "pivot", color: normal.yellow },
    { name: "A metric on a timeseries", type: "timeseries", color: normal.red }
];
const otherTypes = [
    { name: "Segment or table", type: "segment" },
    { name: "SQL", type: "sql" }
];

@connect(() => ({}), {
    selectFlow: flowType => selectFlow(flowType)
})
class QueryTypeList extends Component {
    render() {
        return (
            <div
                className={cxs({
                    display: "flex"
                })}
            >
                <ol
                    className={cxs({
                        display: "flex",
                        flex: "0 0 66.66%",
                        flexWrap: "wrap"
                    })}
                >
                    {queryTypes.map((type, index) => (
                        <li
                            className={`p1 ${cxs({ flex: "0 0 50%" })}`}
                            key={type.type}
                            onClick={() => this.props.selectFlow(type.type)}
                        >
                            <div
                                className={cxs({
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    minHeight: 220,
                                    background: type.color,
                                    color: "#fff",
                                    borderRadius: 4,
                                    ":hover": {
                                        backgroundColor: normal.blue,
                                        color: "#fff",
                                        cursor: "pointer"
                                    }
                                })}
                            >
                                <h3>{type.name}</h3>
                            </div>
                        </li>
                    ))}
                </ol>
                <ol
                    className={cxs({
                        marginLeft: "1em",
                        paddingLeft: "1em",
                        borderLeft: "1px solid #ddd",
                        flex: "0 0 33.33%"
                    })}
                >
                    {otherTypes.map((type, index) => (
                        <li
                            className={`p1 ${cxs({ flex: "0 0 33.33%" })}`}
                            key={type.type}
                            onClick={() => this.props.selectFlow(type.type)}
                        >
                            <div
                                className={cxs({
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    minHeight: 220,
                                    border: "1px solid #ddd",
                                    borderRadius: 4,
                                    ":hover": {
                                        backgroundColor: normal.blue,
                                        color: "#fff",
                                        borderColor: normal.blue,
                                        cursor: "pointer"
                                    }
                                })}
                            >
                                <h3>{type.name}</h3>
                            </div>
                        </li>
                    ))}
                </ol>
            </div>
        );
    }
}

export default QueryTypeList;
