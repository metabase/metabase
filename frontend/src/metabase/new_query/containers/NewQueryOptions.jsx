import React, { Component } from "react";
import { connect } from "react-redux";

import fitViewport from "metabase/hoc/FitViewPort";

import {
  fetchDatabases,
  fetchMetrics,
  fetchSegments,
} from "metabase/redux/metadata";

import { determineWhichOptionsToShow, resetQuery } from "../new_query";
import { t } from "c-3po";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
import Metadata from "metabase-lib/lib/metadata/Metadata";
import { getMetadata, getMetadataFetched } from "metabase/selectors/metadata";
import NewQueryOption from "metabase/new_query/components/NewQueryOption";
import NativeQuery from "metabase-lib/lib/queries/NativeQuery";
import {
  getCurrentQuery,
  getNewQueryOptions,
  getPlainNativeQuery,
} from "metabase/new_query/selectors";
import { getUserIsAdmin } from "metabase/selectors/user";
import { push } from "react-router-redux";
import NoDatabasesEmptyState from "metabase/reference/databases/NoDatabasesEmptyState";

const mapStateToProps = state => ({
  query: getCurrentQuery(state),
  plainNativeQuery: getPlainNativeQuery(state),
  metadata: getMetadata(state),
  metadataFetched: getMetadataFetched(state),
  isAdmin: getUserIsAdmin(state),
  newQueryOptions: getNewQueryOptions(state),
});

const mapDispatchToProps = {
  determineWhichOptionsToShow,
  fetchDatabases,
  fetchMetrics,
  fetchSegments,
  resetQuery,
  push,
};

type Props = {
  // Component parameters
  getUrlForQuery: StructuredQuery => void,
  metricSearchUrl: string,
  segmentSearchUrl: string,

  // Properties injected with redux connect
  query: StructuredQuery,
  plainNativeQuery: NativeQuery,
  metadata: Metadata,
  isAdmin: boolean,

  resetQuery: () => void,
  determineWhichOptionsToShow: () => void,

  fetchDatabases: () => void,
  fetchMetrics: () => void,
  fetchSegments: () => void,
};

const allOptionsVisibleState = {
  loaded: true,
  hasDatabases: true,
  showMetricOption: true,
  showTableOption: true,
  showSQLOption: true,
};

@fitViewport
export class NewQueryOptions extends Component {
  props: Props;

  constructor(props) {
    super(props);

    // By default, show all options instantly to admins
    this.state = props.isAdmin
      ? allOptionsVisibleState
      : {
          loaded: false,
          hasDatabases: false,
          showMetricOption: false,
          showTableOption: false,
          showSQLOption: false,
        };
  }

  async componentWillMount() {
    this.props.resetQuery();
    this.props.determineWhichOptionsToShow(this.getGuiQueryUrl);
  }

  getGuiQueryUrl = () => {
    return this.props.getUrlForQuery(this.props.query);
  };

  getNativeQueryUrl = () => {
    return this.props.getUrlForQuery(this.props.plainNativeQuery);
  };

  render() {
    const { isAdmin, metricSearchUrl, newQueryOptions } = this.props;
    const {
      loaded,
      hasDatabases,
      showMetricOption,
      showSQLOption,
    } = newQueryOptions;
    const showCustomInsteadOfNewQuestionText = showMetricOption || isAdmin;

    if (!loaded) {
      return <LoadingAndErrorWrapper loading={true} />;
    }

    if (!hasDatabases) {
      return (
        <div className="full-height flex align-center justify-center">
          <NoDatabasesEmptyState />
        </div>
      );
    }

    return (
      <div className="full-height flex">
        <div className="wrapper wrapper--trim lg-wrapper--trim xl-wrapper--trim  px4 mt4 mb2 align-center">
          <div
            className="flex align-center justify-center"
            style={{ minHeight: "100%" }}
          >
            <ol className="Grid Grid--guttersXl Grid--full sm-Grid--normal">
              {showMetricOption && (
                <li className="Grid-cell">
                  <NewQueryOption
                    image="app/img/questions_illustration"
                    title={t`Metrics`}
                    description={t`See data over time, as a map, or pivoted to help you understand trends or changes.`}
                    to={metricSearchUrl}
                  />
                </li>
              )}
              <li className="Grid-cell">
                {/*TODO: Move illustrations to the new location in file hierarchy. At the same time put an end to the equal-size-@2x ridicule. */}
                <NewQueryOption
                  image="app/img/query_builder_illustration"
                  title={
                    showCustomInsteadOfNewQuestionText
                      ? t`Custom`
                      : t`New question`
                  }
                  description={t`Use the simple question builder to see trends, lists of things, or to create your own metrics.`}
                  width={180}
                  to={this.getGuiQueryUrl}
                />
              </li>
              {showSQLOption && (
                <li className="Grid-cell">
                  <NewQueryOption
                    image="app/img/sql_illustration"
                    title={t`Native query`}
                    description={t`For more complicated questions, you can write your own SQL or native query.`}
                    to={this.getNativeQueryUrl}
                  />
                </li>
              )}
            </ol>
          </div>
        </div>
      </div>
    );
  }
}

export default connect(mapStateToProps, mapDispatchToProps)(NewQueryOptions);
