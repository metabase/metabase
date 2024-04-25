/* eslint-disable react/prop-types */
import cx from "classnames";
import PropTypes from "prop-types";
import { Component } from "react";
import { connect } from "react-redux";
import { t } from "ttag";
import _ from "underscore";

import Link from "metabase/core/components/Link";
import ButtonsS from "metabase/css/components/buttons.module.css";
import CS from "metabase/css/core/index.css";
import Tables from "metabase/entities/tables";
import * as Urls from "metabase/lib/urls";
import { getMetadata } from "metabase/selectors/metadata";
import Query from "metabase-lib/v1/queries/Query";
import {
  getSegmentOrMetricQuestion,
  getDefaultSegmentOrMetricQuestion,
} from "metabase-lib/v1/queries/utils/segments";

import withTableMetadataLoaded from "../hoc/withTableMetadataLoaded";

import { GuiQueryEditor } from "./GuiQueryEditor";

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
    if (!question.legacyQuery({ useStructuredQuery: true }).isRaw()) {
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
    const legacyQuery = question.legacyQuery({ useStructuredQuery: true });
    const query = question.query();
    const previewUrl = Urls.serializedQuestion(question.card());

    return (
      <div className={CS.py1}>
        <GuiQueryEditor
          features={features}
          legacyQuery={legacyQuery}
          query={query}
          setDatasetQuery={this.setDatasetQuery}
          isShowingDataReference={false}
          supportMultipleAggregations={false}
          canChangeTable={this.props.canChangeTable}
        >
          <div className={cx(CS.flex, CS.alignCenter, CS.mx2, CS.my2)}>
            <span className={cx(CS.textBold, CS.px3)}>{previewSummary}</span>
            <Link
              to={previewUrl}
              target={window.OSX ? null : "_blank"}
              rel="noopener noreferrer"
              className={cx(ButtonsS.Button, ButtonsS.ButtonPrimary)}
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
