/* eslint-disable react/prop-types */
import React, { Component } from "react";
import { connect } from "react-redux";
import { push } from "react-router-redux";
import { t } from "ttag";
import MetabaseSettings from "metabase/lib/settings";
import * as Urls from "metabase/lib/urls";
import { Grid } from "metabase/components/Grid";
import NewModelOption from "metabase/new_model/components/NewModelOption";
import NoDatabasesEmptyState from "metabase/reference/databases/NoDatabasesEmptyState";
import { getHasDataAccess, getHasNativeWrite } from "metabase/selectors/data";
import Database from "metabase/entities/databases";
import {
  OptionsGridItem,
  OptionsRoot,
  EducationalButton,
} from "./NewModelOptions.styled";

const EDUCATIONAL_LINK = MetabaseSettings.learnUrl("data-modeling/models");

const mapStateToProps = state => ({
  hasDataAccess: getHasDataAccess(state),
  hasNativeWrite: getHasNativeWrite(state),
});

const mapDispatchToProps = {
  prefetchDatabases: () => Database.actions.fetchList(),
  push,
};

class NewModelOptions extends Component {
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
      <OptionsRoot>
        <Grid className="justifyCenter">
          {hasDataAccess && (
            <OptionsGridItem itemsCount={itemsCount}>
              <NewModelOption
                image="app/img/notebook_mode_illustration"
                title={t`Use the notebook editor`}
                description={t`This automatically inherits metadata from your source tables, and gives your models drill-through.`}
                width={180}
                to={Urls.newQuestion({
                  mode: "query",
                  creationType: "custom_question",
                  dataset: true,
                })}
                data-metabase-event="New Model; Custom Question Start"
              />
            </OptionsGridItem>
          )}
          {hasNativeWrite && (
            <OptionsGridItem itemsCount={itemsCount}>
              <NewModelOption
                image="app/img/sql_illustration"
                title={t`Use a native query`}
                description={t`You can always fall back to a SQL or native query, which is a bit more manual.`}
                to={Urls.newQuestion({
                  mode: "query",
                  type: "native",
                  creationType: "native_question",
                  dataset: true,
                })}
                width={180}
                data-metabase-event="New Model; Native Query Start"
              />
            </OptionsGridItem>
          )}
        </Grid>

        <EducationalButton
          target="_blank"
          href={EDUCATIONAL_LINK}
          className="mt4"
        >
          {t`What's a model?`}
        </EducationalButton>
      </OptionsRoot>
    );
  }
}

export default connect(mapStateToProps, mapDispatchToProps)(NewModelOptions);
