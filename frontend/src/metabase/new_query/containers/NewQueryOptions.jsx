import React, { Component } from "react";

import { connect } from "react-redux";
import { push } from "react-router-redux";

import { t } from "ttag";

import fitViewport from "metabase/hoc/FitViewPort";

import { Box } from "grid-styled";
import { Grid, GridItem } from "metabase/components/Grid";

import NewQueryOption from "metabase/new_query/components/NewQueryOption";
import NoDatabasesEmptyState from "metabase/reference/databases/NoDatabasesEmptyState";

import * as Urls from "metabase/lib/urls";

import {
  getHasDataAccess,
  getHasNativeWrite,
} from "metabase/new_query/selectors";

import Database from "metabase/entities/databases";

const mapStateToProps = state => ({
  hasDataAccess: getHasDataAccess(state),
  hasNativeWrite: getHasNativeWrite(state),
});

const mapDispatchToProps = {
  prefetchTables: () => Database.actions.fetchList({ include: "tables" }),
  prefetchDatabases: () => Database.actions.fetchList({ saved: true }),
  push,
};

const PAGE_PADDING = [1, 4];

@fitViewport
@connect(
  mapStateToProps,
  mapDispatchToProps,
)
export default class NewQueryOptions extends Component {
  props: Props;

  componentWillMount(props) {
    this.props.prefetchTables();
    this.props.prefetchDatabases();
    const { location, push } = this.props;
    if (Object.keys(location.query).length > 0) {
      const { database, table, ...options } = location.query;
      push(
        Urls.newQuestion({
          ...options,
          databaseId: database ? parseInt(database) : undefined,
          tableId: table ? parseInt(table) : undefined,
        }),
      );
    }
  }

  render() {
    const { hasDataAccess, hasNativeWrite } = this.props;

    if (!hasDataAccess && !hasNativeWrite) {
      return (
        <div className="full-height flex align-center justify-center">
          <NoDatabasesEmptyState />
        </div>
      );
    }

    {
      /* Determine how many items will be shown based on permissions etc so we can make sure the layout adapts */
    }
    const NUM_ITEMS = (hasDataAccess ? 2 : 0) + (hasNativeWrite ? 1 : 0);
    const ITEM_WIDTHS = [1, 1 / 2, 1 / NUM_ITEMS];

    return (
      <Box my="auto" mx={PAGE_PADDING}>
        <Grid className="justifyCenter">
          {hasDataAccess && (
            <GridItem w={ITEM_WIDTHS}>
              <NewQueryOption
                image="app/img/simple_mode_illustration"
                title={t`Simple question`}
                description={t`Pick some data, view it, and easily filter, summarize, and visualize it.`}
                width={180}
                to={Urls.newQuestion()}
                data-metabase-event={`New Question; Simple Question Start`}
              />
            </GridItem>
          )}
          {hasDataAccess && (
            <GridItem w={ITEM_WIDTHS}>
              <NewQueryOption
                image="app/img/notebook_mode_illustration"
                title={t`Custom question`}
                description={t`Use the advanced notebook editor to join data, create custom columns, do math, and more.`}
                width={180}
                to={Urls.newQuestion({ mode: "notebook" })}
                data-metabase-event={`New Question; Custom Question Start`}
              />
            </GridItem>
          )}
          {hasNativeWrite && (
            <GridItem w={ITEM_WIDTHS}>
              <NewQueryOption
                image="app/img/sql_illustration"
                title={t`Native query`}
                description={t`For more complicated questions, you can write your own SQL or native query.`}
                to={Urls.newQuestion({ type: "native" })}
                width={180}
                data-metabase-event={`New Question; Native Query Start`}
              />
            </GridItem>
          )}
        </Grid>
      </Box>
    );
  }
}
