/* eslint-disable react/prop-types */
import React, { Component } from "react";

import { connect } from "react-redux";
import { push } from "react-router-redux";

import { t } from "ttag";

import { Grid } from "metabase/components/Grid";

import NewQueryOption from "metabase/new_query/components/NewQueryOption";
import NoDatabasesEmptyState from "metabase/reference/databases/NoDatabasesEmptyState";

import * as Urls from "metabase/lib/urls";

import {
  getHasDataAccess,
  getHasNativeWrite,
} from "metabase/new_query/selectors";
import Database from "metabase/entities/databases";
import {
  QueryOptionsGridItem,
  QueryOptionsRoot,
} from "./NewQueryOptions.styled";

const mapStateToProps = state => ({
  hasDataAccess: getHasDataAccess(state),
  hasNativeWrite: getHasNativeWrite(state),
});

const mapDispatchToProps = {
  prefetchDatabases: () => Database.actions.fetchList(),
  push,
};

class NewDatasetOptions extends Component {
  componentDidMount() {
    // We need to check if any databases exist otherwise show an empty state.
    // Be aware that the embedded version does not have the Navbar, which also
    // loads databases, so we should not remove it.
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
    const itemsCount = (hasDataAccess ? 1 : 0) + (hasNativeWrite ? 1 : 0);

    return (
      <QueryOptionsRoot>
        <Grid className="justifyCenter">
          {hasDataAccess && (
            <QueryOptionsGridItem itemsCount={itemsCount}>
              <NewQueryOption
                image="app/img/notebook_mode_illustration"
                title={t`Use the notebook editor`}
                description={t`Use the advanced notebook editor to join data, create custom columns, do math, and more.`}
                width={180}
                to={Urls.newQuestion({
                  mode: "query",
                  creationType: "custom_question",
                  dataset: true,
                })}
                data-metabase-event="New Dataset; Custom Question Start"
              />
            </QueryOptionsGridItem>
          )}
          {hasNativeWrite && (
            <QueryOptionsGridItem itemsCount={itemsCount}>
              <NewQueryOption
                image="app/img/sql_illustration"
                title={t`Use a native query`}
                description={t`For more complicated questions, you can write your own SQL or native query.`}
                to={Urls.newQuestion({
                  mode: "query",
                  type: "native",
                  creationType: "native_question",
                  dataset: true,
                })}
                width={180}
                data-metabase-event="New Dataset; Native Query Start"
              />
            </QueryOptionsGridItem>
          )}
        </Grid>
      </QueryOptionsRoot>
    );
  }
}

export default connect(mapStateToProps, mapDispatchToProps)(NewDatasetOptions);
