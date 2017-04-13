import cxs from "cxs";
import React, { Component } from "react";
import { connect } from "react-redux";

import Text from "metabase/components/Text";
import Title from "metabase/components/Title";
import Surface from "metabase/components/Surface";

import { selectAndAdvance, selectFlow } from "../actions";

const QUERY_TYPES = [
    {
        name: "Explore",
        subtitle: "See data as a map, over time,or pivoted to help you understand trends or changes.",
        type: "metric"
    },
    { name: "Segment or table", subtitle: "", type: "segment" },
    { name: "SQL", type: "sql", icon: "sql" }
];

const layout = cxs({
    flex: "0 0 33.33%",
    paddingLeft: "4em",
    paddingright: "4em",
    height: 537
});

const QueryTypeCard = ({ name, subtitle }) => (
    <Surface>
        <Title>{name}</Title>
        <Text>{subtitle}</Text>
    </Surface>
);

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
                    display: "flex",
                    height: "100%",
                    maxWidth: 1650,
                    marginLeft: "auto",
                    marginRight: "auto"
                })}
            >
                <ol className={cxs({ display: "flex", width: "100%" })}>
                    {QUERY_TYPES.map(type => (
                        <li
                            key={type.type}
                            onClick={() =>
                                selectAndAdvance(() => selectFlow(type))}
                            className={layout}
                        >
                            <QueryTypeCard {...type} />
                        </li>
                    ))}
                </ol>
            </div>
        );
    }
}

export default QueryTypeList;
