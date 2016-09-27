/* eslint "react/prop-types": "warn" */
import React, { Component, PropTypes } from "react";

import DetailPane from "./DetailPane.jsx";
import QueryButton from "metabase/components/QueryButton.jsx";
import UseForButton from "./UseForButton.jsx";
import QueryDefinition from "./QueryDefinition.jsx";

import Query from "metabase/lib/query";
import { createCard } from "metabase/lib/card";
import { createQuery } from "metabase/lib/query";

import _ from "underscore";

export default class SegmentPane extends Component {
    constructor(props, context) {
        super(props, context);

        this.state = {
            table: undefined,
            tableForeignKeys: undefined
        };

        _.bindAll(this, "filterBy", "setQueryFilteredBy", "setQueryCountFilteredBy");
    }

    static propTypes = {
        segment: PropTypes.object.isRequired,
        query: PropTypes.object,
        loadTableAndForeignKeysFn: PropTypes.func.isRequired,
        runQueryFn: PropTypes.func.isRequired,
        setQueryFn: PropTypes.func.isRequired,
        setCardAndRun: PropTypes.func.isRequired
    };

    componentWillMount() {
        this.props.loadTableAndForeignKeysFn(this.props.segment.table_id).then((result) => {
            this.setState({
                table: result.table,
                tableForeignKeys: result.foreignKeys
            });
        }).catch((error) => {
            this.setState({
                error: "An error occurred loading the table"
            });
        });
    }

    filterBy() {
        let query = this.props.query;
        // Add an aggregation so both aggregation and filter popovers aren't visible
        if (!Query.hasValidAggregation(query.query)) {
            Query.updateAggregation(query.query, ["rows"]);
        }
        Query.addFilter(query.query);
        Query.updateFilter(query.query, Query.getFilters(query.query).length - 1, ["SEGMENT", this.props.segment.id]);
        this.props.setQueryFn(query);
        this.props.runQueryFn();
    }

    newCard() {
        let card = createCard();
        card.dataset_query = createQuery("query", this.state.table.db_id, this.state.table.id);
        return card;
    }

    setQueryFilteredBy() {
        let card = this.newCard();
        card.dataset_query.query.aggregation = ["rows"];
        card.dataset_query.query.filter = ["SEGMENT", this.props.segment.id];
        this.props.setCardAndRun(card);
    }

    setQueryCountFilteredBy() {
        let card = this.newCard();
        card.dataset_query.query.aggregation = ["count"];
        card.dataset_query.query.filter = ["SEGMENT", this.props.segment.id];
        this.props.setCardAndRun(card);
    }

    render() {
        let { segment, query } = this.props;
        let { error, table } = this.state;

        let segmentName = segment.name;

        let useForCurrentQuestion = [];
        let usefulQuestions = [];

        if (query.query && query.query.source_table === segment.table_id && !_.findWhere(Query.getFilters(query.query), { [0]: "SEGMENT", [1]: segment.id })) {
            useForCurrentQuestion.push(<UseForButton title={"Filter by " + segmentName} onClick={this.filterBy} />);
        }

        usefulQuestions.push(<QueryButton icon="illustration-icon-scalar" text={"Number of " + segmentName} onClick={this.setQueryCountFilteredBy} />);
        usefulQuestions.push(<QueryButton icon="illustration-icon-table" text={"See all " + segmentName} onClick={this.setQueryFilteredBy} />);

        return (
            <DetailPane
                name={segmentName}
                description={segment.description}
                useForCurrentQuestion={useForCurrentQuestion}
                usefulQuestions={usefulQuestions}
                error={error}
                extra={table &&
                    <div>
                        <p className="text-bold">Segment Definition</p>
                        <QueryDefinition object={segment} tableMetadata={table} />
                    </div>
                }
            />
        );
    }
}
