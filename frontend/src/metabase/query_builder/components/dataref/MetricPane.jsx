/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";

import DetailPane from "./DetailPane.jsx";
import QueryButton from "metabase/components/QueryButton.jsx";
import QueryDefinition from "./QueryDefinition.jsx";

import { createCard } from "metabase/lib/card";
import { createQuery } from "metabase/lib/query";

import _ from "underscore";

export default class MetricPane extends Component {
    constructor(props, context) {
        super(props, context);

        this.state = {
            table: undefined,
            tableForeignKeys: undefined
        };

        _.bindAll(this, "setQueryMetric");
    }

    static propTypes = {
        metric: PropTypes.object.isRequired,
        query: PropTypes.object,
        loadTableAndForeignKeysFn: PropTypes.func.isRequired,
        runQuery: PropTypes.func.isRequired,
        setDatasetQuery: PropTypes.func.isRequired,
        setCardAndRun: PropTypes.func.isRequired
    };

    componentWillMount() {
        this.props.loadTableAndForeignKeysFn(this.props.metric.table_id).then((result) => {
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

    newCard() {
        let card = createCard();
        card.dataset_query = createQuery("query", this.state.table.db_id, this.state.table.id);
        return card;
    }

    setQueryMetric() {
        let card = this.newCard();
        card.dataset_query.query.aggregation = ["METRIC", this.props.metric.id];
        this.props.setCardAndRun(card);
    }

    render() {
        let { metric } = this.props;
        let { table, error } = this.state;

        let metricName = metric.name;

        let useForCurrentQuestion = [];
        let usefulQuestions = [];

        usefulQuestions.push(<QueryButton icon="number" text={"See " + metricName} onClick={this.setQueryMetric} />);

        return (
            <DetailPane
                name={metricName}
                description={metric.description}
                useForCurrentQuestion={useForCurrentQuestion}
                usefulQuestions={usefulQuestions}
                error={error}
                extra={table &&
                    <div>
                        <p className="text-bold">Metric Definition</p>
                        <QueryDefinition object={metric} tableMetadata={table} />
                    </div>
                }
            />
        );
    }
}
