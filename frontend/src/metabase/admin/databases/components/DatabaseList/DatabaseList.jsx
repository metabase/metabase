/* eslint-disable react/prop-types */
import React, { Component } from "react";
import PropTypes from "prop-types";
import { Link } from "react-router";
import { t } from "ttag";

import cx from "classnames";
import { isSyncCompleted } from "metabase/lib/syncing";

import LoadingSpinner from "metabase/components/LoadingSpinner";
import FormMessage from "metabase/components/form/FormMessage";
import Modal from "metabase/components/Modal";
import DatabaseSyncModal from "metabase/databases/containers/DatabaseSyncModal";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";

import {
  TableCellContent,
  TableCellSpinner,
} from "../../containers/DatabaseListApp.styled";

const query = {
  ...PLUGIN_FEATURE_LEVEL_PERMISSIONS.databaseDetailsQueryProps,
};

export default class DatabaseList extends Component {
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
    isAdmin: PropTypes.bool,
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
      <div className="wrapper" data-testid="database-list">
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
          {!hasSampleDatabase && isAdmin ? (
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
          <DatabaseSyncModal onClose={this.onSyncingModalClose} />
        </Modal>
      </div>
    );
  }
}
