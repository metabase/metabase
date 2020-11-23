/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { t } from "ttag";
import { fetchTableMetadata } from "metabase/redux/metadata";
import { getMetadata } from "metabase/selectors/metadata";

import DetailPane from "./DetailPane";
import QueryButton from "metabase/components/QueryButton";
import UseForButton from "./UseForButton";
import QueryDefinition from "../QueryDefinition";

import { createCard } from "metabase/lib/card";
import * as Q_DEPRECATED from "metabase/lib/query";

import _ from "underscore";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";

const mapDispatchToProps = {
  fetchTableMetadata,
};

const mapStateToProps = (state, props) => ({
  metadata: getMetadata(state, props),
});

@connect(
  mapStateToProps,
  mapDispatchToProps,
)
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
      if (!Q_DEPRECATED.hasValidAggregation(query.datasetQuery().query)) {
        query = query.clearAggregations();
      }

      query = query.filter(["segment", this.props.segment.id]);

      this.props.updateQuestion(query.question());
      this.props.runQuestionQuery();
    }
  }

  newCard() {
    const { segment, metadata } = this.props;
    const table = metadata && metadata.table(segment.table_id);

    if (table) {
      const card = createCard();
      card.dataset_query = Q_DEPRECATED.createQuery(
        "query",
        table.db_id,
        table.id,
      );
      return card;
    } else {
      throw new Error(
        t`Could not find the table metadata prior to creating a new question`,
      );
    }
  }
  setQueryFilteredBy() {
    const card = this.newCard();
    card.dataset_query.query.aggregation = ["rows"];
    card.dataset_query.query.filter = ["segment", this.props.segment.id];
    this.props.setCardAndRun(card);
  }

  setQueryCountFilteredBy() {
    const card = this.newCard();
    card.dataset_query.query.aggregation = ["count"];
    card.dataset_query.query.filter = ["segment", this.props.segment.id];
    this.props.setCardAndRun(card);
  }

  render() {
    const { segment, question } = this.props;
    const query = question.query();

    const segmentName = segment.name;

    const useForCurrentQuestion = [];
    const usefulQuestions = [];

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
          <div>
            <p className="text-bold">{t`Segment Definition`}</p>
            <QueryDefinition object={segment} />
          </div>
        }
      />
    );
  }
}
