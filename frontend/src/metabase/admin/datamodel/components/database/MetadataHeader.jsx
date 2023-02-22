/* eslint-disable react/prop-types */
import React, { Component } from "react";
import PropTypes from "prop-types";
import { Link, withRouter } from "react-router";
import _ from "underscore";

import Databases from "metabase/entities/databases";

import { DatabaseDataSelector } from "metabase/query_builder/components/DataSelector";
import SaveStatus from "metabase/components/SaveStatus";
import Icon from "metabase/components/Icon";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";

class MetadataHeader extends Component {
  static propTypes = {
    databaseId: PropTypes.number,
    databases: PropTypes.array.isRequired,
    selectDatabase: PropTypes.func.isRequired,
    isShowingSchema: PropTypes.bool.isRequired,
    toggleShowSchema: PropTypes.func.isRequired,
  };

  setDatabaseIdIfUnset() {
    const { databaseId, databases = [], selectDatabase } = this.props;
    if (databaseId === undefined && databases.length > 0) {
      selectDatabase(databases[0], true);
    }
  }

  componentDidMount() {
    this.setDatabaseIdIfUnset();
  }

  componentDidUpdate() {
    this.setDatabaseIdIfUnset();
  }

  // Show a gear to access Table settings page if we're currently looking at a Table. Otherwise show nothing.
  // TODO - it would be nicer just to disable the gear so the page doesn't jump around once you select a Table.
  renderTableSettingsButton() {
    const isViewingTable = this.props.location.pathname.match(/table\/\d+\/?$/);
    if (!isViewingTable) {
      return null;
    }

    return (
      <span className="ml4 mr3">
        <Link to={`${this.props.location.pathname}/settings`}>
          <Icon name="gear" className="text-brand-hover" />
        </Link>
      </span>
    );
  }

  render() {
    return (
      <div className="MetadataEditor-header flex align-center flex-no-shrink pb2">
        <Icon
          className="flex align-center flex-no-shrink text-medium"
          name="database"
        />
        <div className="MetadataEditor-headerSection h2">
          <DatabaseDataSelector
            databases={this.props.databases ?? []}
            selectedDatabaseId={this.props.databaseId}
            setDatabaseFn={id => this.props.selectDatabase({ id })}
            style={{ padding: 0, paddingLeft: 8 }}
          />
        </div>
        <div className="MetadataEditor-headerSection flex flex-align-right align-center flex-no-shrink">
          <SaveStatus />
          {this.renderTableSettingsButton()}
        </div>
      </div>
    );
  }
}

export default _.compose(
  withRouter,
  Databases.loadList({
    query: {
      ...PLUGIN_FEATURE_LEVEL_PERMISSIONS.dataModelQueryProps,
    },
  }),
)(MetadataHeader);
