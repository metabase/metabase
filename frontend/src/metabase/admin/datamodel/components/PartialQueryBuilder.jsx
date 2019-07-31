import React, { Component } from "react";
import PropTypes from "prop-types";

import GuiQueryEditor from "metabase/query_builder/components/GuiQueryEditor";
import { t } from "ttag";
import * as Urls from "metabase/lib/urls";

import cx from "classnames";

import Question from "metabase-lib/lib/Question";

export default class PartialQueryBuilder extends Component {
  static propTypes = {
    onChange: PropTypes.func.isRequired,
    tableMetadata: PropTypes.object.isRequired,
    updatePreviewSummary: PropTypes.func.isRequired,
    previewSummary: PropTypes.string,
  };

  componentDidMount() {
    const { value, tableMetadata } = this.props;
    this.props.updatePreviewSummary({
      type: "query",
      database: tableMetadata.db_id,
      query: {
        ...value,
        "source-table": tableMetadata.id,
      },
    });
  }

  setDatasetQuery = datasetQuery => {
    this.props.onChange(datasetQuery.query);
    this.props.updatePreviewSummary(datasetQuery);
  };

  render() {
    const {
      features,
      value,
      metadata,
      tableMetadata,
      previewSummary,
    } = this.props;

    const datasetQuery = {
      type: "query",
      database: tableMetadata.db_id,
      query: {
        ...value,
        "source-table": tableMetadata.id,
      },
    };

    const query = new Question(metadata, {
      dataset_query: datasetQuery,
    }).query();

    const previewCard = {
      dataset_query: datasetQuery,
    };
    const previewUrl = Urls.question(null, previewCard);

    return (
      <div className="py1">
        <GuiQueryEditor
          features={features}
          query={query}
          databases={tableMetadata && [tableMetadata.db]}
          setDatabaseFn={null}
          setSourceTableFn={null}
          setDatasetQuery={this.setDatasetQuery}
          isShowingDataReference={false}
          supportMultipleAggregations={false}
        >
          <div className="flex align-center mx2 my2">
            <span className="text-bold px3">{previewSummary}</span>
            <a
              data-metabase-event={"Data Model;Preview Click"}
              target={window.OSX ? null : "_blank"}
              className={cx("Button Button--primary")}
              href={previewUrl}
            >{t`Preview`}</a>
          </div>
        </GuiQueryEditor>
      </div>
    );
  }
}
