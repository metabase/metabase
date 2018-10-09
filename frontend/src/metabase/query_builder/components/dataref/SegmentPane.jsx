/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { t } from "c-3po";
import { fetchTableMetadata } from "metabase/redux/metadata";
import { getMetadata } from "metabase/selectors/metadata";

import DetailPane from "./DetailPane.jsx";
import QueryButton from "metabase/components/QueryButton.jsx";
import UseForButton from "./UseForButton.jsx";
import QueryDefinition from "./QueryDefinition.jsx";

import { createCard } from "metabase/lib/card";
import Query, { createQuery } from "metabase/lib/query";

import _ from "underscore";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";

const mapDispatchToProps = {
  fetchTableMetadata,
};

const mapStateToProps = (state, props) => ({
  metadata: getMetadata(state, props),
});

@connect(mapStateToProps, mapDispatchToProps)
export default class SegmentPane extends Component {
  constructor(props, context) {
    super(props, context);

    _.bindAll(
      this,
      "filterBy",
      "setQueryFilteredBy",
      "setQueryCountFilteredBy",
    );
  }

  static propTypes = {
    segment: PropTypes.object.isRequired,
    datasetQuery: PropTypes.object,
    fetchTableMetadata: PropTypes.func.isRequired,
    runQuestionQuery: PropTypes.func.isRequired,
    updateQuestion: PropTypes.func.isRequired,
    setCardAndRun: PropTypes.func.isRequired,
    question: PropTypes.object.isRequired,
    originalQuestion: PropTypes.object.isRequired,
    metadata: PropTypes.object.isRequired,
  };

  componentWillMount() {
    this.props.fetchTableMetadata(this.props.segment.table_id);
  }

  filterBy() {
    const { question } = this.props;
    let query = question.query();

    if (query instanceof StructuredQuery) {
      // Add an aggregation so both aggregation and filter popovers aren't visible
      if (!Query.hasValidAggregation(query.datasetQuery().query)) {
        query = query.clearAggregations();
      }

      query = query.addFilter(["segment", this.props.segment.id]);

      this.props.updateQuestion(query.question());
      this.props.runQuestionQuery();
    }
  }

  newCard() {
    const { segment, metadata } = this.props;
    const table = metadata && metadata.tables[segment.table_id];

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
  setQueryFilteredBy() {
    let card = this.newCard();
    card.dataset_query.query.aggregation = ["rows"];
    card.dataset_query.query.filter = ["segment", this.props.segment.id];
    this.props.setCardAndRun(card);
  }

  setQueryCountFilteredBy() {
    let card = this.newCard();
    card.dataset_query.query.aggregation = ["count"];
    card.dataset_query.query.filter = ["segment", this.props.segment.id];
    this.props.setCardAndRun(card);
  }

  render() {
    let { segment, metadata, question } = this.props;
    const query = question.query();

    let segmentName = segment.name;

    let useForCurrentQuestion = [];
    let usefulQuestions = [];

    if (
      query instanceof StructuredQuery &&
      query.tableId() === segment.table_id &&
      !_.findWhere(query.filters(), { [0]: "segment", [1]: segment.id })
    ) {
      useForCurrentQuestion.push(
        <UseForButton
          title={t`Filter by ${segmentName}`}
          onClick={this.filterBy}
        />,
      );
    }

    usefulQuestions.push(
      <QueryButton
        icon="number"
        text={t`Number of ${segmentName}`}
        onClick={this.setQueryCountFilteredBy}
      />,
    );
    usefulQuestions.push(
      <QueryButton
        icon="table"
        text={t`See all ${segmentName}`}
        onClick={this.setQueryFilteredBy}
      />,
    );

    return (
      <DetailPane
        name={segmentName}
        description={segment.description}
        useForCurrentQuestion={useForCurrentQuestion}
        usefulQuestions={usefulQuestions}
        extra={
          metadata && (
            <div>
              <p className="text-bold">{t`Segment Definition`}</p>
              <QueryDefinition
                object={segment}
                tableMetadata={metadata.tables[segment.table_id]}
              />
            </div>
          )
        }
      />
    );
  }
}
