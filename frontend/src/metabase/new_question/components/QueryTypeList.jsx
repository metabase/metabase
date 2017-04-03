import cxs from "cxs";
import React, { Component } from "react";
import { connect } from "react-redux";
import Icon from "metabase/components/Icon"

import { normal } from "metabase/lib/colors";
import { selectAndAdvance, selectFlow } from "../actions";

const queryTypes = [
    { name: "A metric", type: "metric", color: normal.blue, icon: 'ruler' },
    { name: "A metric on a map", type: "geo", color: normal.green, icon: 'location' },
    { name: "Pivot a metric", type: "pivot", color: normal.yellow },
    { name: "A metric on a timeseries", type: "timeseries", color: normal.red, icon: 'line' }
];
const otherTypes = [
    { name: "Segment or table", type: "segment", icon: 'table' },
    { name: "SQL", type: "sql", icon: 'sql' }
];

@connect(() => ({}), {
    selectFlow: flowType => selectFlow(flowType),
    selectAndAdvance,
})
class QueryTypeList extends Component {
    render() {
        const { selectFlow, selectAndAdvance } = this.props;

        const cardStyle = (index) => cxs({
            paddingTop: '2em',
            paddingBottom: '2em',
            display: "flex",
            alignItems: "center",
            flexDirection: 'column',
            justifyContent: "center",
            backgroundColor: '#fff',
            borderBottom:  index > 1 ? 'none' : '1px solid #DCE1E4',
            borderLeft: (index + 1) % 2 === 0 ? '1px solid #DCE1E4' : 'none',
        })

        return (
            <div
                className={cxs({
                    display: "flex",
                    marginTop: '2em'
                })}
            >
                <ol
                    className={cxs({
                        display: "flex",
                        flex: "0 0 66.66%",
                        flexWrap: "wrap",
                        backgroundColor: '#fff',
                        border: '1px solid #DCE1E4',
                        borderRadius: 6
                    })}
                >
                    {queryTypes.map((type, index) => (
                        <li
                            className={cxs({ flex: "0 0 50%" })}
                            key={type.type}
                            onClick={() =>
                                selectAndAdvance(() =>
                                    selectFlow(type.type)
                                )
                            }
                        >
                            <div
                                className={cardStyle(index)}
                            >
                                <Icon
                                    name={type.icon}
                                    className="my4"
                                    style={{ color: type.color}}
                                    size={64}
                                />
                                <h3>{type.name}</h3>
                            </div>
                        </li>
                    ))}
                </ol>
                <ol
                    className={cxs({
                        marginLeft: "1em",
                        paddingLeft: "1em",
                        flex: "0 0 33.33%"
                    })}
                >
                    {otherTypes.map((type, index) => (
                        <li
                            className={cxs({ flex: "0 0 33.33%" })}
                            key={type.type}
                            onClick={() => this.props.selectFlow(type.type)}
                        >
                            <div
                                className={cardStyle()}
                            >
                                <Icon
                                    name={type.icon}
                                    className="my4"
                                    style={{ color: type.color}}
                                    size={64}
                                />
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
