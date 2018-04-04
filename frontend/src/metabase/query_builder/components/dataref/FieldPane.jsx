/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";
import { t } from "c-3po";
import DetailPane from "./DetailPane.jsx";
import QueryButton from "metabase/components/QueryButton.jsx";
import UseForButton from "./UseForButton.jsx";

import { fetchTableMetadata } from "metabase/redux/metadata";
import { getMetadata } from "metabase/selectors/metadata";
import { createCard } from "metabase/lib/card";
import Query, { createQuery } from "metabase/lib/query";
import { isDimension, isSummable } from "metabase/lib/schema_metadata";
import inflection from "inflection";

import _ from "underscore";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
import { connect } from "react-redux";
import Dimension from "metabase-lib/lib/Dimension";

const mapDispatchToProps = {
  fetchTableMetadata,
};

const mapStateToProps = (state, props) => ({
  metadata: getMetadata(state, props),
});

@connect(mapStateToProps, mapDispatchToProps)
export default class FieldPane extends Component {
  constructor(props, context) {
    super(props, context);
  }

  static propTypes = {
    field: PropTypes.object.isRequired,
    datasetQuery: PropTypes.object,
    question: PropTypes.object,
    originalQuestion: PropTypes.object,
    metadata: PropTypes.object,
    fetchTableMetadata: PropTypes.func.isRequired,
    runQuestionQuery: PropTypes.func.isRequired,
    setDatasetQuery: PropTypes.func.isRequired,
    setCardAndRun: PropTypes.func.isRequired,
    updateQuestion: PropTypes.func.isRequired,
  };

  componentWillMount() {
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

  groupBy = () => {
    let { question, metadata, field } = this.props;
    let query = question.query();

    if (query instanceof StructuredQuery) {
      // Add an aggregation so both aggregation and filter popovers aren't visible
      if (!Query.hasValidAggregation(query.datasetQuery().query)) {
        query = query.clearAggregations();
      }

      const defaultBreakout = metadata.fields[field.id].getDefaultBreakout();
      query = query.addBreakout(defaultBreakout);

      this.props.updateQuestion(query.question());
      this.props.runQuestionQuery();
    }
  };

  newCard = () => {
    const { metadata, field } = this.props;
    const tableId = field.table_id;
    const dbId = metadata.tables[tableId].database.id;

    let card = createCard();
    card.dataset_query = createQuery("query", dbId, tableId);
    return card;
  };

  setQuerySum = () => {
    let card = this.newCard();
    card.dataset_query.query.aggregation = ["sum", this.props.field.id];
    this.props.setCardAndRun(card);
  };

  setQueryDistinct = () => {
    const { metadata, field } = this.props;
    const defaultBreakout = metadata.fields[field.id].getDefaultBreakout();

    let card = this.newCard();
    card.dataset_query.query.aggregation = ["rows"];
    card.dataset_query.query.breakout = [defaultBreakout];
    this.props.setCardAndRun(card);
  };

  setQueryCountGroupedBy = chartType => {
    const { metadata, field } = this.props;
    const defaultBreakout = metadata.fields[field.id].getDefaultBreakout();

    let card = this.newCard();
    card.dataset_query.query.aggregation = ["count"];
    card.dataset_query.query.breakout = [defaultBreakout];
    card.display = chartType;
    this.props.setCardAndRun(card);
  };

  isBreakoutWithCurrentField = breakout => {
    const { field, metadata } = this.props;
    const dimension = Dimension.parseMBQL(breakout, metadata);
    return dimension && dimension.field().id === field.id;
  };

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
    if (
      query instanceof StructuredQuery &&
      query.tableId() === field.table_id
    ) {
      // NOTE: disabled this for now because we need a way to capture the completed filter before adding it to the query, or to pop open the filter widget here?
      // useForCurrentQuestion.push(<UseForButton title={"Filter by " + name} onClick={this.filterBy} />);

      // current field must be a valid breakout option for this table AND cannot already be in the breakout clause of our query
      if (
        validBreakout &&
        !_.some(query.breakouts(), this.isBreakoutWithCurrentField)
      ) {
        useForCurrentQuestion.push(
          <UseForButton title={t`Group by ${name}`} onClick={this.groupBy} />,
        );
      }
    }

    if (isSummable(field)) {
      usefulQuestions.push(
        <QueryButton
          icon="number"
          text={t`Sum of all values of ${fieldName}`}
          onClick={this.setQuerySum}
        />,
      );
    }
    usefulQuestions.push(
      <QueryButton
        icon="table"
        text={t`All distinct values of ${fieldName}`}
        onClick={this.setQueryDistinct}
      />,
    );
    let queryCountGroupedByText = t`Number of ${inflection.pluralize(
      tableName,
    )} grouped by ${fieldName}`;
    if (validBreakout) {
      usefulQuestions.push(
        <QueryButton
          icon="bar"
          text={queryCountGroupedByText}
          onClick={this.setQueryCountGroupedBy.bind(null, "bar")}
        />,
      );
      usefulQuestions.push(
        <QueryButton
          icon="pie"
          text={queryCountGroupedByText}
          onClick={this.setQueryCountGroupedBy.bind(null, "pie")}
        />,
      );
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
