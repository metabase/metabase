/* eslint-disable react/prop-types */
import React, { Component } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { Link } from "react-router";
import { t } from "ttag";
import _ from "underscore";

import cx from "classnames";
import MetabaseSettings from "metabase/lib/settings";
import { isSyncCompleted, isSyncInProgress } from "metabase/lib/syncing";

import LoadingSpinner from "metabase/components/LoadingSpinner";
import LoadingAndGenericErrorWrapper from "metabase/components/LoadingAndGenericErrorWrapper";
import FormMessage from "metabase/components/form/FormMessage";
import Modal from "metabase/components/Modal";
import SyncingModal from "metabase/containers/SyncingModal";
import { getUserIsAdmin } from "metabase/selectors/user";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";

import { TableCellContent, TableCellSpinner } from "./DatabaseListApp.styled";

import Database from "metabase/entities/databases";

import {
  getDeletes,
  getDeletionError,
  getIsAddingSampleDatabase,
  getAddSampleDatabaseError,
} from "../selectors";
import {
  deleteDatabase,
  addSampleDatabase,
  closeSyncingModal,
} from "../database";

const RELOAD_INTERVAL = 2000;

const getReloadInterval = (state, props, databases = []) => {
  return databases.some(d => isSyncInProgress(d)) ? RELOAD_INTERVAL : 0;
};

const mapStateToProps = (state, props) => ({
  isAdmin: getUserIsAdmin(state),
  hasSampleDatabase: Database.selectors.getHasSampleDatabase(state),
  isAddingSampleDatabase: getIsAddingSampleDatabase(state),
  addSampleDatabaseError: getAddSampleDatabaseError(state),

  created: props.location.query.created,
  engines: MetabaseSettings.get("engines"),
  showSyncingModal: MetabaseSettings.get("show-database-syncing-modal"),

  deletes: getDeletes(state),
  deletionError: getDeletionError(state),
});

const query = {
  ...PLUGIN_FEATURE_LEVEL_PERMISSIONS.databaseDetailsQueryProps,
};

const mapDispatchToProps = {
  // NOTE: still uses deleteDatabase from metabaseadmin/databases/databases.js
  // rather than metabase/entities/databases since it updates deletes/deletionError
  deleteDatabase: deleteDatabase,
  addSampleDatabase: addSampleDatabase,
  closeSyncingModal,
};

class DatabaseList extends Component {
  constructor(props) {
    super(props);

    props.databases.map(database => {
      this["deleteDatabaseModal_" + database.id] = React.createRef();
    });

    this.state = {
      isSyncingModalOpened: (props.created && props.showSyncingModal) || false,
    };
  }

  componentDidMount() {
    if (this.state.isSyncingModalOpened) {
      this.props.closeSyncingModal();
    }
  }

  onSyncingModalClose = () => {
    this.setState({ isSyncingModalOpened: false });
  };

  static propTypes = {
    databases: PropTypes.array,
    hasSampleDatabase: PropTypes.bool,
    engines: PropTypes.object,
    deletes: PropTypes.array,
    deletionError: PropTypes.object,
    created: PropTypes.string,
    showSyncingModal: PropTypes.bool,
    closeSyncingModal: PropTypes.func,
  };

  render() {
    const {
      databases,
      hasSampleDatabase,
      isAddingSampleDatabase,
      addSampleDatabaseError,
      engines,
      deletionError,
      isAdmin,
    } = this.props;
    const { isSyncingModalOpened } = this.state;

    const error = deletionError || addSampleDatabaseError;

    return (
      <div className="wrapper">
        <section className="PageHeader px2 clearfix">
          {isAdmin && (
            <Link
              to="/admin/databases/create"
              className="Button Button--primary float-right"
            >{t`Add database`}</Link>
          )}
          <h2 className="PageTitle">{t`Databases`}</h2>
        </section>
        {error && (
          <section>
            <FormMessage formError={error} />
          </section>
        )}
        <section>
          <table className="ContentTable">
            <thead>
              <tr>
                <th>{t`Name`}</th>
                <th>{t`Engine`}</th>
              </tr>
            </thead>
            <tbody>
              {databases ? (
                [
                  databases.map(database => {
                    const isDeleting =
                      this.props.deletes.indexOf(database.id) !== -1;
                    return (
                      <tr
                        key={database.id}
                        className={cx({ disabled: isDeleting })}
                      >
                        <td>
                          <TableCellContent>
                            {!isSyncCompleted(database) && (
                              <TableCellSpinner size={16} borderWidth={2} />
                            )}
                            <Link
                              to={"/admin/databases/" + database.id}
                              className="text-bold link"
                            >
                              {database.name}
                            </Link>
                          </TableCellContent>
                        </td>
                        <td>
                          {engines && engines[database.engine]
                            ? engines[database.engine]["driver-name"]
                            : database.engine}
                        </td>
                      </tr>
                    );
                  }),
                ]
              ) : (
                <tr>
                  <td colSpan={4}>
                    <LoadingSpinner />
                    <h3>{t`Loading ...`}</h3>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {!hasSampleDatabase ? (
            <div className="pt4">
              <span
                className={cx("p2 text-italic", {
                  "border-top": databases && databases.length > 0,
                })}
              >
                {isAddingSampleDatabase ? (
                  <span className="text-light no-decoration">
                    {t`Restoring the sample database...`}
                  </span>
                ) : (
                  <a
                    className="text-light text-brand-hover no-decoration"
                    onClick={() => this.props.addSampleDatabase(query)}
                  >
                    {t`Bring the sample database back`}
                  </a>
                )}
              </span>
            </div>
          ) : null}
        </section>
        <Modal
          small
          isOpen={isSyncingModalOpened}
          onClose={this.onSyncingModalClose}
        >
          <SyncingModal onClose={this.onSyncingModalClose} />
        </Modal>
      </div>
    );
  }
}

export default _.compose(
  Database.loadList({
    reloadInterval: getReloadInterval,
    query,
    LoadingAndErrorWrapper: LoadingAndGenericErrorWrapper,
  }),
  connect(mapStateToProps, mapDispatchToProps),
)(DatabaseList);
