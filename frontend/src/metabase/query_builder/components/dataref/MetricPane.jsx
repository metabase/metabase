/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import { connect } from "react-redux";
import PropTypes from "prop-types";
import { t } from "c-3po";
import DetailPane from "./DetailPane.jsx";
import QueryButton from "metabase/components/QueryButton.jsx";
import QueryDefinition from "./QueryDefinition.jsx";

import { createCard } from "metabase/lib/card";
import { createQuery } from "metabase/lib/query";

import _ from "underscore";
import { fetchTableMetadata } from "metabase/redux/metadata";

import { getMetadata } from "metabase/selectors/metadata";

const mapDispatchToProps = {
  fetchTableMetadata,
};

const mapStateToProps = (state, props) => ({
  metadata: getMetadata(state, props),
});

@connect(mapStateToProps, mapDispatchToProps)
export default class MetricPane extends Component {
  constructor(props, context) {
    super(props, context);

    _.bindAll(this, "setQueryMetric");
  }

  static propTypes = {
    metric: PropTypes.object.isRequired,
    query: PropTypes.object,
    fetchTableMetadata: PropTypes.func.isRequired,
    runQuestionQuery: PropTypes.func.isRequired,
    setDatasetQuery: PropTypes.func.isRequired,
    setCardAndRun: PropTypes.func.isRequired,
    metadata: PropTypes.object,
  };

  componentWillMount() {
    this.props.fetchTableMetadata(this.props.metric.table_id);
  }

  newCard() {
    const { metric, metadata } = this.props;
    const table = metadata && metadata.tables[metric.table_id];

    if (table) {
      let card = createCard();
      card.dataset_query = createQuery("query", table.db_id, table.id);
      return card;
    } else {
      throw new Error(
        t`Could not find the table metadata prior to creating a new question`,
      );
    }
  }

  setQueryMetric() {
    let card = this.newCard();
    card.dataset_query.query.aggregation = ["metric", this.props.metric.id];
    this.props.setCardAndRun(card);
  }

  render() {
    let { metric, metadata } = this.props;

    let metricName = metric.name;

    let useForCurrentQuestion = [];
    let usefulQuestions = [];

    usefulQuestions.push(
      <QueryButton
        icon="number"
        text={t`See ${metricName}`}
        onClick={this.setQueryMetric}
      />,
    );

    return (
      <DetailPane
        name={metricName}
        description={metric.description}
        useForCurrentQuestion={useForCurrentQuestion}
        usefulQuestions={usefulQuestions}
        extra={
          metadata && (
            <div>
              <p className="text-bold">{t`Metric Definition`}</p>
              <QueryDefinition
                object={metric}
                tableMetadata={metadata.tables[metric.table_id]}
              />
            </div>
          )
        }
      />
    );
  }
}
