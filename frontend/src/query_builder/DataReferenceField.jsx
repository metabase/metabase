import React, { Component, PropTypes } from "react";

import DataReferenceQueryButton from './DataReferenceQueryButton.jsx';
import Icon from "metabase/components/Icon.jsx";
import Query from "metabase/lib/query";
import { createCard } from "metabase/lib/card";
import { createQuery } from "metabase/lib/query";
import { isDimension } from "metabase/lib/schema_metadata";
import inflection from 'inflection';

import cx from "classnames";
import _ from "underscore";

export default class DataReferenceField extends Component {
    constructor(props, context) {
        super(props, context);
        this.filterBy = this.filterBy.bind(this);
        this.groupBy = this.groupBy.bind(this);
        this.setQueryCountGroupedBy = this.setQueryCountGroupedBy.bind(this);
        this.setQueryDistinct = this.setQueryDistinct.bind(this);
        this.setQuerySum = this.setQuerySum.bind(this);

        this.state = {
            table: undefined,
            tableForeignKeys: undefined
        };
    }

    static propTypes = {
        loadTableFn: PropTypes.func.isRequired,
        runQueryFn: PropTypes.func.isRequired,
        setQueryFn: PropTypes.func.isRequired,
        setCardAndRun: PropTypes.func.isRequired
    };

    componentWillMount() {
        this.props.loadTableFn(this.props.field.table_id).then((result) => {
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
            // useForCurrentQuestion.push(
            //     <li key="filter-by" className="mt1">
            //         <a className="Button Button--white text-default text-brand-hover border-brand-hover no-decoration" onClick={this.filterBy}>
            //             <Icon className="mr1" name="add" width="12px" height="12px"/> Filter by {name}
            //             </a>
            //     </li>
            // );

            // current field must be a valid breakout option for this table AND cannot already be in the breakout clause of our query
            if (validBreakout && this.state.table.id === this.props.query.query.source_table && (query.query.breakout && !_.contains(query.query.breakout, field.id))) {
                useForCurrentQuestion.push(
                    <li key="group-by" className="mt1">
                        <a className="Button Button--white text-default text-brand-hover border-brand-hover no-decoration" onClick={this.groupBy}>
                            <Icon className="mr1" name="add" width="12px" height="12px" /> Group by {name}
                        </a>
                    </li>
                );
            }
        }

        if (this.props.field.special_type === "number") {
            usefulQuestions.push(<li className="border-row-divider" key="sum"><DataReferenceQueryButton icon="illustration-icon-scalar" text={"Sum of all values of " + fieldName} onClick={this.setQuerySum} /></li>);
        }
        usefulQuestions.push(<li className="border-row-divider" key="distinct-values"><DataReferenceQueryButton icon="illustration-icon-table" text={"All distinct values of " + fieldName} onClick={this.setQueryDistinct} /></li>);
        let queryCountGroupedByText = "Number of " + inflection.pluralize(tableName) + " grouped by " + fieldName;
        if (validBreakout) {
            usefulQuestions.push(<li className="border-row-divider" key="count-bar"><DataReferenceQueryButton icon="illustration-icon-bars" text={queryCountGroupedByText} onClick={this.setQueryCountGroupedBy.bind(null, "bar")} /></li>);
            usefulQuestions.push(<li className="border-row-divider" key="count-pie"><DataReferenceQueryButton icon="illustration-icon-pie" text={queryCountGroupedByText} onClick={this.setQueryCountGroupedBy.bind(null, "pie")} /></li>);
        }

        let descriptionClasses = cx({ "text-grey-3": !this.props.field.description });
        let description = (<p className={descriptionClasses}>{this.props.field.description || "No description set."}</p>);

        return (
            <div>
                <h1>{fieldName}</h1>
                {description}
                {useForCurrentQuestion.length > 0 ?
                    <div>
                        <p className="text-bold">Use for current question</p>
                        <ul className="my2">{useForCurrentQuestion}</ul>
                    </div>
                : null }
                <p className="text-bold">Potentially useful questions</p>
                <ul>{usefulQuestions}</ul>
                <div>{error}</div>
            </div>
        );
    }
}
