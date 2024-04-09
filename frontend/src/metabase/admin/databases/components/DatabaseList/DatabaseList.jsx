/* eslint-disable react/prop-types */
import cx from "classnames";
import PropTypes from "prop-types";
import { createRef, Component } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import LoadingSpinner from "metabase/components/LoadingSpinner";
import Modal from "metabase/components/Modal";
import FormMessage from "metabase/components/form/FormMessage";
import AdminS from "metabase/css/admin.module.css";
import ButtonsS from "metabase/css/components/buttons.module.css";
import CS from "metabase/css/core/index.css";
import { DatabaseSyncModal } from "metabase/databases/components/DatabaseSyncModal";
import { isSyncCompleted } from "metabase/lib/syncing";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";

import {
  TableCellContent,
  TableCellSpinner,
  AddSampleDatabaseLink,
} from "../../containers/DatabaseListApp.styled";

const query = {
  ...PLUGIN_FEATURE_LEVEL_PERMISSIONS.databaseDetailsQueryProps,
};

export default class DatabaseList extends Component {
  constructor(props) {
    super(props);

    props.databases.map(database => {
      this["deleteDatabaseModal_" + database.id] = createRef();
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
      <div className={CS.wrapper} data-testid="database-list">
        <section className={cx(AdminS.PageHeader, CS.px2, "clearfix")}>
          {isAdmin && (
            <Link
              to="/admin/databases/create"
              className={cx(
                ButtonsS.Button,
                ButtonsS.ButtonPrimary,
                "float-right",
              )}
            >{t`Add database`}</Link>
          )}
          <h2 className={CS.m0}>{t`Databases`}</h2>
        </section>
        {error && (
          <section>
            <FormMessage formError={error} />
          </section>
        )}
        <section>
          <table className={AdminS.ContentTable}>
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
                              className={cx(CS.textBold, CS.link)}
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
            <div className={CS.pt4}>
              <span
                className={cx(CS.p2, CS.textItalic, {
                  [CS.borderTop]: databases && databases.length > 0,
                })}
              >
                {isAddingSampleDatabase ? (
                  <span className={cx("text-light", CS.noDecoration)}>
                    {t`Restoring the sample database...`}
                  </span>
                ) : (
                  <AddSampleDatabaseLink
                    onClick={() => this.props.addSampleDatabase(query)}
                  >
                    {t`Bring the sample database back`}
                  </AddSampleDatabaseLink>
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
