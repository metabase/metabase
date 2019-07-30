import React, { Component } from "react";
import { Box } from "grid-styled";
import { connect } from "react-redux";

import fitViewport from "metabase/hoc/FitViewPort";

import {
  fetchDatabases,
  fetchMetrics,
  fetchSegments,
} from "metabase/redux/metadata";

import { determineWhichOptionsToShow, resetQuery } from "../new_query";
import { t } from "ttag";
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

import { Grid, GridItem } from "metabase/components/Grid";

import * as Urls from "metabase/lib/urls";

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
  dataBrowseUrl: string,

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
const PAGE_PADDING = [1, 4];

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
    const { newQueryOptions } = this.props;
    const {
      loaded,
      hasDatabases,
      showMetricOption,
      showSQLOption,
    } = newQueryOptions;

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

    {
      /* Determine how many items will be shown based on permissions etc so we can make sure the layout adapts */
    }
    const NUM_ITEMS = showMetricOption + showSQLOption + 1;
    const ITEM_WIDTHS = [1, 1 / 2, 1 / NUM_ITEMS];

    return (
      <Box my="auto" mx={PAGE_PADDING}>
        <Grid className="justifyCenter">
          <GridItem w={ITEM_WIDTHS}>
            <NewQueryOption
              image="app/img/simple_mode_illustration"
              title={t`Simple question`}
              description={t`Pick some data, view it, and easily filter, summarize, and visualize it.`}
              width={180}
              to={Urls.newQuestion()}
            />
          </GridItem>
          <GridItem w={ITEM_WIDTHS}>
            <NewQueryOption
              image="app/img/notebook_mode_illustration"
              title={t`Custom question`}
              description={t`Use the advanced notebook editor to join data, create custom columns, do math, and more.`}
              width={180}
              to={Urls.newQuestion({ mode: "notebook" })}
            />
          </GridItem>
          {showSQLOption && (
            <GridItem w={ITEM_WIDTHS}>
              <NewQueryOption
                image="app/img/sql_illustration"
                title={t`Native query`}
                description={t`For more complicated questions, you can write your own SQL or native query.`}
                to={Urls.newQuestion({ type: "native" })}
                width={180}
              />
            </GridItem>
          )}
        </Grid>
      </Box>
    );
  }
}

export default connect(
  mapStateToProps,
  mapDispatchToProps,
)(NewQueryOptions);
