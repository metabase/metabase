/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";

import DetailPane from "./DetailPane.jsx";
import QueryButton from "metabase/components/QueryButton.jsx";
import UseForButton from "./UseForButton.jsx";

import { fetchTableMetadata } from "metabase/redux/metadata";
import { getMetadata } from "metabase/selectors/metadata";
import { createCard } from "metabase/lib/card";
import Query, { createQuery } from "metabase/lib/query";
import { isDimension, isSummable } from "metabase/lib/schema_metadata";
import inflection from 'inflection';

import _ from "underscore";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";

const mapDispatchToProps = {
    fetchTableMetadata,
};

const mapStateToProps = (state, props) => ({
    metadata: getMetadata(state, props)
})

@connect(mapStateToProps, mapDispatchToProps)
export default class FieldPane extends Component {
    constructor(props, context) {
        super(props, context);

        _.bindAll(this, "groupBy", "setQuerySum", "setQueryDistinct", "setQueryCountGroupedBy");
    }

    static propTypes = {
        field: PropTypes.object.isRequired,
        datasetQuery: PropTypes.object,
        question: PropTypes.object,
        originalQuestion: PropTypes.object,
        fetchTableMetadata: PropTypes.func.isRequired,
        runQuestionQuery: PropTypes.func.isRequired,
        setDatasetQuery: PropTypes.func.isRequired,
        setCardAndRun: PropTypes.func.isRequired,
        updateQuestion: PropTypes.func.isRequired
    };

    componentWillMount() {
        console.log(this.props);
        this.props.fetchTableMetadata(this.props.field.table_id);
    }

    // See the note in render() method about filterBy
    // filterBy() {
    //     var datasetQuery = this.setDatabaseAndTable();
    //     // Add an aggregation so both aggregation and filter popovers aren't visible
    //     if (!Query.hasValidAggregation(datasetQuery.query)) {
    //         Query.clearAggregations(datasetQuery.query);
    //     }
    //     Query.addFilter(datasetQuery.query, [null, this.props.field.id, null]);
    //     this.props.setDatasetQuery(datasetQuery);
    // }

    groupBy() {
        let { question } = this.props;
        let query = question.query();

        if (query instanceof StructuredQuery) {
            // Add an aggregation so both aggregation and filter popovers aren't visible
            if (!Query.hasValidAggregation(query.datasetQuery().query)) {
                query = query.clearAggregations()
            }

            query = query.addBreakout(["field-id", this.props.field.id]);

            this.props.updateQuestion(query.question())
            this.props.runQuestionQuery();
        }
    }

    newCard() {
        let card = createCard();
        card.dataset_query = createQuery("query", this.props.field.db_id, this.props.field.table_id);
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
        let { field, question } = this.props;

        const query = question.query();

        let fieldName = field.display_name;
        let tableName = query.table() ? query.table().display_name : "";

        let useForCurrentQuestion = [],
            usefulQuestions = [];

        // determine if the selected field is a valid dimension on this table
        let validBreakout = false;
        if (query.table()) {
            const validDimensions = _.filter(query.table().fields, isDimension);
            validBreakout = _.some(validDimensions, f => f.id === field.id);
        }

        // TODO: allow for filters/grouping via foreign keys
        if (query instanceof StructuredQuery && query.tableId() === field.table_id) {
            // NOTE: disabled this for now because we need a way to capture the completed filter before adding it to the query, or to pop open the filter widget here?
            // useForCurrentQuestion.push(<UseForButton title={"Filter by " + name} onClick={this.filterBy} />);

            // current field must be a valid breakout option for this table AND cannot already be in the breakout clause of our query
            if (validBreakout && !_.findWhere(query.breakouts(), {[0]: "field-id", [1]: field.id})) {
                useForCurrentQuestion.push(<UseForButton title={"Group by " + name} onClick={this.groupBy} />);
            }
        }

        if (isSummable(field)) {
            usefulQuestions.push(<QueryButton icon="number" text={"Sum of all values of " + fieldName} onClick={this.setQuerySum} />);
        }
        usefulQuestions.push(<QueryButton icon="table" text={"All distinct values of " + fieldName} onClick={this.setQueryDistinct} />);
        let queryCountGroupedByText = "Number of " + inflection.pluralize(tableName) + " grouped by " + fieldName;
        if (validBreakout) {
            usefulQuestions.push(<QueryButton icon="bar" text={queryCountGroupedByText} onClick={this.setQueryCountGroupedBy.bind(null, "bar")} />);
            usefulQuestions.push(<QueryButton icon="pie" text={queryCountGroupedByText} onClick={this.setQueryCountGroupedBy.bind(null, "pie")} />);
        }

        return (
            <DetailPane
                name={fieldName}
                description={field.description}
                useForCurrentQuestion={useForCurrentQuestion}
                usefulQuestions={usefulQuestions}
            />
        );
    }
}
