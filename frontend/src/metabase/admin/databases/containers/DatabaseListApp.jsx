/* eslint-disable react/prop-types */
import React, { Component } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { Link } from "react-router";
import { t } from "ttag";

import cx from "classnames";
import MetabaseSettings from "metabase/lib/settings";

import ModalWithTrigger from "metabase/components/ModalWithTrigger";
import LoadingSpinner from "metabase/components/LoadingSpinner";
import FormMessage from "metabase/components/form/FormMessage";

import CreatedDatabaseModal from "../components/CreatedDatabaseModal";
import DeleteDatabaseModal from "../components/DeleteDatabaseModal";

import Database from "metabase/entities/databases";

import {
  getDeletes,
  getDeletionError,
  getIsAddingSampleDataset,
  getAddSampleDatasetError,
} from "../selectors";
import { deleteDatabase, addSampleDataset } from "../database";

const mapStateToProps = (state, props) => ({
  hasSampleDataset: Database.selectors.getHasSampleDataset(state),
  isAddingSampleDataset: getIsAddingSampleDataset(state),
  addSampleDatasetError: getAddSampleDatasetError(state),

  created: props.location.query.created,
  engines: MetabaseSettings.get("engines"),

  deletes: getDeletes(state),
  deletionError: getDeletionError(state),
});

const mapDispatchToProps = {
  // NOTE: still uses deleteDatabase from metabaseadmin/databases/databases.js
  // rather than metabase/entities/databases since it updates deletes/deletionError
  deleteDatabase: deleteDatabase,
  addSampleDataset: addSampleDataset,
};

@Database.loadList()
@connect(
  mapStateToProps,
  mapDispatchToProps,
)
export default class DatabaseList extends Component {
  constructor(props) {
    super(props);

    this.createdDatabaseModal = React.createRef();
    props.databases.map(database => {
      this["deleteDatabaseModal_" + database.id] = React.createRef();
    });
  }

  static propTypes = {
    databases: PropTypes.array,
    hasSampleDataset: PropTypes.bool,
    engines: PropTypes.object,
    deletes: PropTypes.array,
    deletionError: PropTypes.object,
  };

  UNSAFE_componentWillReceiveProps(newProps) {
    if (!this.props.created && newProps.created) {
      this.createdDatabaseModal.current.open();
    }
  }

  render() {
    const {
      databases,
      hasSampleDataset,
      isAddingSampleDataset,
      addSampleDatasetError,
      created,
      engines,
      deletionError,
    } = this.props;

    const error = deletionError || addSampleDatasetError;

    return (
      <div className="wrapper">
        <section className="PageHeader px2 clearfix">
          <Link
            to="/admin/databases/create"
            className="Button Button--primary float-right"
          >{t`Add database`}</Link>
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
                <th />
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
                          <Link
                            to={"/admin/databases/" + database.id}
                            className="text-bold link"
                          >
                            {database.name}
                          </Link>
                        </td>
                        <td>
                          {engines && engines[database.engine]
                            ? engines[database.engine]["driver-name"]
                            : database.engine}
                        </td>
                        {isDeleting ? (
                          <td className="text-right">{t`Deleting...`}</td>
                        ) : (
                          <td className="Table-actions">
                            <ModalWithTrigger
                              ref={this["deleteDatabaseModal_" + database.id]}
                              triggerClasses="Button Button--danger"
                              triggerElement={t`Delete`}
                            >
                              <DeleteDatabaseModal
                                database={database}
                                onClose={() =>
                                  this[
                                    "deleteDatabaseModal_" + database.id
                                  ].current.close()
                                }
                                onDelete={() =>
                                  this.props.deleteDatabase(database.id)
                                }
                              />
                            </ModalWithTrigger>
                          </td>
                        )}
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
          {!hasSampleDataset ? (
            <div className="pt4">
              <span
                className={cx("p2 text-italic", {
                  "border-top": databases && databases.length > 0,
                })}
              >
                {isAddingSampleDataset ? (
                  <span className="text-light no-decoration">
                    {t`Restoring the sample dataset...`}
                  </span>
                ) : (
                  <a
                    className="text-light text-brand-hover no-decoration"
                    onClick={() => this.props.addSampleDataset()}
                  >
                    {t`Bring the sample dataset back`}
                  </a>
                )}
              </span>
            </div>
          ) : null}
        </section>
        <ModalWithTrigger
          ref={this.createdDatabaseModal}
          isInitiallyOpen={created}
        >
          <CreatedDatabaseModal
            databaseId={parseInt(created)}
            onDone={() => this.createdDatabaseModal.current.toggle()}
            onClose={() => this.createdDatabaseModal.current.toggle()}
          />
        </ModalWithTrigger>
      </div>
    );
  }
}
