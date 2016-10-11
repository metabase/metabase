/* eslint "react/prop-types": "warn" */
import React, { Component, PropTypes } from "react";

import DetailPane from "./DetailPane.jsx";
import QueryButton from "metabase/components/QueryButton.jsx";
import UseForButton from "./UseForButton.jsx";

import Query from "metabase/lib/query";
import { createCard } from "metabase/lib/card";
import { createQuery } from "metabase/lib/query";
import { isDimension, isSummable } from "metabase/lib/schema_metadata";
import inflection from 'inflection';

import _ from "underscore";

export default class FieldPane extends Component {
    constructor(props, context) {
        super(props, context);

        this.state = {
            table: undefined,
            tableForeignKeys: undefined
        };

        _.bindAll(this, "filterBy", "groupBy", "setQuerySum", "setQueryDistinct", "setQueryCountGroupedBy");
    }

    static propTypes = {
        field: PropTypes.object.isRequired,
        query: PropTypes.object,
        loadTableAndForeignKeysFn: PropTypes.func.isRequired,
        runQueryFn: PropTypes.func.isRequired,
        setQueryFn: PropTypes.func.isRequired,
        setCardAndRun: PropTypes.func.isRequired
    };

    componentWillMount() {
        this.props.loadTableAndForeignKeysFn(this.props.field.table_id).then((result) => {
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
        var query = this.setDatabaseAndTable();
        // Add an aggregation so both aggregation and filter popovers aren't visible
        if (!Query.hasValidAggregation(query.query)) {
            Query.updateAggregation(query.query, ["rows"]);
        }
        Query.addFilter(query.query);
        Query.updateFilter(query.query, Query.getFilters(query.query).length - 1, [null, this.props.field.id, null]);
        this.props.setQueryFn(query);
    }

    groupBy() {
        let query = this.props.query;
        if (!Query.hasValidAggregation(query.query)) {
            Query.updateAggregation(query.query, ["rows"]);
        }
        Query.addDimension(query.query);
        Query.updateDimension(query.query, this.props.field.id, query.query.breakout.length - 1);
        this.props.setQueryFn(query);
        this.props.runQueryFn();
    }

    newCard() {
        let card = createCard();
        card.dataset_query = createQuery("query", this.state.table.db_id, this.state.table.id);
        return card;
    }

    setQuerySum() {
        let card = this.newCard();
        card.dataset_query.query.aggregation = ["sum", this.props.field.id];
        this.props.setCardAndRun(card);
    }

    setQueryDistinct() {
        let card = this.newCard();
        card.dataset_query.query.aggregation = ["rows"];
        card.dataset_query.query.breakout = [this.props.field.id];
        this.props.setCardAndRun(card);
    }

    setQueryCountGroupedBy(chartType) {
        let card = this.newCard();
        card.dataset_query.query.aggregation = ["count"];
        card.dataset_query.query.breakout = [this.props.field.id];
        card.display = chartType;
        this.props.setCardAndRun(card);
    }

    render() {
        let { field, query } = this.props;
        let { table, error } = this.state;

        let fieldName = field.display_name;
        let tableName = table ? table.display_name : "";

        let useForCurrentQuestion = [],
            usefulQuestions = [];

        // determine if the selected field is a valid dimension on this table
        let validBreakout = false;
        if (this.state.table) {
            const validDimensions = _.filter(table.fields, isDimension);
            validBreakout = _.some(validDimensions, f => f.id === field.id);
        }

        // TODO: allow for filters/grouping via foreign keys
        if (!query.query || query.query.source_table == undefined || query.query.source_table === field.table_id) {
            // NOTE: disabled this for now because we need a way to capture the completed filter before adding it to the query, or to pop open the filter widget here?
            // useForCurrentQuestion.push(<UseForButton title={"Filter by " + name} onClick={this.filterBy} />);

            // current field must be a valid breakout option for this table AND cannot already be in the breakout clause of our query
            if (validBreakout && this.state.table.id === this.props.query.query.source_table && (query.query.breakout && !_.contains(query.query.breakout, field.id))) {
                useForCurrentQuestion.push(<UseForButton title={"Group by " + name} onClick={this.groupBy} />);
            }
        }

        if (isSummable(field)) {
            usefulQuestions.push(<QueryButton icon="illustration-icon-scalar" text={"Sum of all values of " + fieldName} onClick={this.setQuerySum} />);
        }
        usefulQuestions.push(<QueryButton icon="illustration-icon-table" text={"All distinct values of " + fieldName} onClick={this.setQueryDistinct} />);
        let queryCountGroupedByText = "Number of " + inflection.pluralize(tableName) + " grouped by " + fieldName;
        if (validBreakout) {
            usefulQuestions.push(<QueryButton icon="illustration-icon-bars" text={queryCountGroupedByText} onClick={this.setQueryCountGroupedBy.bind(null, "bar")} />);
            usefulQuestions.push(<QueryButton icon="illustration-icon-pie" text={queryCountGroupedByText} onClick={this.setQueryCountGroupedBy.bind(null, "pie")} />);
        }

        return (
            <DetailPane
                name={fieldName}
                description={field.description}
                useForCurrentQuestion={useForCurrentQuestion}
                usefulQuestions={usefulQuestions}
                error={error}
            />
        );
    }
}
