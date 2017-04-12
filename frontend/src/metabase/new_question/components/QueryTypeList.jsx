import cxs from "cxs";
import React, { Component } from "react";
import { connect } from "react-redux";

import Text from "metabase/components/Text";
import Surface from "metabase/components/Surface";

import { selectAndAdvance, selectFlow } from "../actions";

const QUERY_TYPES = [
    { name: "Explore", subtitle: "Test", type: "metric" },
    { name: "Segment or table", type: "segment" },
    { name: "SQL", type: "sql", icon: "sql" }
];

@connect(() => ({}), {
    selectFlow: flowType => selectFlow(flowType),
    selectAndAdvance
})
class QueryTypeList extends Component {
    render() {
        const { selectFlow, selectAndAdvance } = this.props;

        return (
            <div
                className={cxs({
                    display: "flex"
                })}
            >
                <ol>
                    {QUERY_TYPES.map(({ name, subtitle, type }) => (
                        <li
                            key={type}
                            onClick={() =>
                                selectAndAdvance(() => selectFlow(type))}
                        >
                            <Surface>
                                <h3>{name}</h3>
                                <Text>{subtitle}</Text>
                            </Surface>
                        </li>
                    ))}
                </ol>
            </div>
        );
    }
}

export default QueryTypeList;
