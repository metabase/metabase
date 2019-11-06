import React, { Component } from "react";
import PropTypes from "prop-types";
import { Link, withRouter } from "react-router";
import { t } from "ttag";
import SaveStatus from "metabase/components/SaveStatus";
import Toggle from "metabase/components/Toggle";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import ColumnarSelector from "metabase/components/ColumnarSelector";
import Icon from "metabase/components/Icon";
import Databases from "metabase/entities/databases";

@withRouter
@Databases.loadList()
export default class MetadataHeader extends Component {
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
      selectDatabase(databases[0]);
    }
  }

  componentDidUpdate() {
    this.setDatabaseIdIfUnset();
  }

  componentWillMount() {
    this.setDatabaseIdIfUnset();
  }

  setSaving() {
    this.refs.status.setSaving.apply(this, arguments);
  }

  setSaved() {
    this.refs.status.setSaved.apply(this, arguments);
  }

  setSaveError() {
    this.refs.status.setSaveError.apply(this, arguments);
  }

  renderDbSelector() {
    const database = this.props.databases.filter(
      db => db.id === this.props.databaseId,
    )[0];
    if (database) {
      const columns = [
        {
          selectedItem: database,
          items: this.props.databases,
          itemTitleFn: db => db.name,
          itemSelectFn: db => {
            this.props.selectDatabase(db);
            this.refs.databasePopover.toggle();
          },
        },
      ];
      const triggerElement = (
        <span className="text-bold cursor-pointer text-default text-wrap mr2">
          {database.name}
          <Icon className="ml1" name="chevrondown" size={8} />
        </span>
      );
      return (
        <PopoverWithTrigger
          ref="databasePopover"
          triggerElement={triggerElement}
        >
          <ColumnarSelector columns={columns} />
        </PopoverWithTrigger>
      );
    }
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
          <Icon name="gear" />
        </Link>
      </span>
    );
  }

  render() {
    return (
      <div className="MetadataEditor-header flex align-center flex-no-shrink">
        <div className="MetadataEditor-headerSection py2 h2">
          <span className="text-medium">{t`Current database:`}</span>{" "}
          {this.renderDbSelector()}
        </div>
        <div className="MetadataEditor-headerSection flex flex-align-right align-center flex-no-shrink">
          <SaveStatus ref="status" />
          <span className="mr1">{t`Show original schema`}</span>
          <Toggle
            value={this.props.isShowingSchema}
            onChange={this.props.toggleShowSchema}
          />
          {this.renderTableSettingsButton()}
        </div>
      </div>
    );
  }
}
