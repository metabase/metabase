/* eslint-disable react/prop-types */
import React, { Component } from "react";
import { connect } from "react-redux";
import PropTypes from "prop-types";
import { t } from "ttag";
import _ from "underscore";

import { Link } from "metabase/core/components/Link";
import { getMetadata } from "metabase/selectors/metadata";
import Tables from "metabase/entities/tables";
import GuiQueryEditor from "metabase/query_builder/components/GuiQueryEditor";
import * as Urls from "metabase/lib/urls";
import Query from "metabase-lib/queries/Query";
import {
  getSegmentOrMetricQuestion,
  getDefaultSegmentOrMetricQuestion,
} from "metabase-lib/queries/utils/segments";

import withTableMetadataLoaded from "../hoc/withTableMetadataLoaded";

class PartialQueryBuilder extends Component {
  static propTypes = {
    onChange: PropTypes.func.isRequired,
    table: PropTypes.object,
    updatePreviewSummary: PropTypes.func.isRequired,
    previewSummary: PropTypes.string,
  };

  componentDidMount() {
    const { value, table } = this.props;
    if (table && value != null) {
      this.props.updatePreviewSummary({
        type: "query",
        database: table.db_id,
        query: {
          ...value,
          "source-table": table.id,
        },
      });
    } else {
      this.maybeSetDefaultQuery();
    }
  }

  componentDidUpdate() {
    this.maybeSetDefaultQuery();
  }

  maybeSetDefaultQuery() {
    const { metadata, table, value } = this.props;

    // we need metadata and a table to generate a default query
    if (!metadata || !table) {
      return;
    }

    // only set the query if it doesn't already have an aggregation or filter
    const question = getSegmentOrMetricQuestion(value, table, metadata);
    if (!question.query().isRaw()) {
      return;
    }

    const defaultQuestion = getDefaultSegmentOrMetricQuestion(table, metadata);
    if (defaultQuestion) {
      this.setDatasetQuery(defaultQuestion.datasetQuery());
    }
  }

  setDatasetQuery = datasetQuery => {
    if (datasetQuery instanceof Query) {
      datasetQuery = datasetQuery.datasetQuery();
    }

    this.props.onChange(datasetQuery.query);
    this.props.updatePreviewSummary(datasetQuery);
  };

  render() {
    const { features, value, metadata, table, previewSummary } = this.props;

    const question = getSegmentOrMetricQuestion(value, table, metadata);
    const query = question.query();
    const previewUrl = Urls.serializedQuestion(question.card());

    return (
      <div className="py1">
        <GuiQueryEditor
          features={features}
          query={query}
          setDatasetQuery={this.setDatasetQuery}
          isShowingDataReference={false}
          supportMultipleAggregations={false}
          canChangeTable={this.props.canChangeTable}
        >
          <div className="flex align-center mx2 my2">
            <span className="text-bold px3">{previewSummary}</span>
            <Link
              to={previewUrl}
              data-metabase-event="Data Model;Preview Click"
              target={window.OSX ? null : "_blank"}
              rel="noopener noreferrer"
              className="Button Button--primary"
            >{t`Preview`}</Link>
          </div>
        </GuiQueryEditor>
      </div>
    );
  }
}

export default _.compose(
  Tables.load({
    id: (state, props) => props.value && props.value["source-table"],
    wrapped: true,
  }),
  withTableMetadataLoaded,
  connect((state, props) => ({ metadata: getMetadata(state) })),
)(PartialQueryBuilder);
