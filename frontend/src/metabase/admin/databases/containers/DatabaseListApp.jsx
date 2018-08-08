/* @flow weak */

import React, { Component } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { Link } from "react-router";
import { t } from "c-3po";

import cx from "classnames";
import MetabaseSettings from "metabase/lib/settings";

import ModalWithTrigger from "metabase/components/ModalWithTrigger.jsx";
import LoadingSpinner from "metabase/components/LoadingSpinner.jsx";
import FormMessage from "metabase/components/form/FormMessage";

import CreatedDatabaseModal from "../components/CreatedDatabaseModal.jsx";
import DeleteDatabaseModal from "../components/DeleteDatabaseModal.jsx";

import Databases from "metabase/entities/databases";
import { entityListLoader } from "metabase/entities/containers/EntityListLoader";

import { getDeletes, getDeletionError } from "../selectors";
import { deleteDatabase, addSampleDataset } from "../database";

const mapStateToProps = (state, props) => ({
  hasSampleDataset: Databases.selectors.getHasSampleDataset(state),

  created: props.location.query.created,
  engines: MetabaseSettings.get("engines"),

  deletes: getDeletes(state),
  deletionError: getDeletionError(state),
});

const mapDispatchToProps = {
  fetchDatabases: Databases.actions.fetchList,
  // NOTE: still uses deleteDatabase from metabaseadmin/databases/databases.js
  // rather than metabase/entities/databases since it updates deletes/deletionError
  deleteDatabase: deleteDatabase,
  addSampleDataset: addSampleDataset,
};

@entityListLoader({ entityType: "databases" })
@connect(mapStateToProps, mapDispatchToProps)
export default class DatabaseList extends Component {
  static propTypes = {
    databases: PropTypes.array,
    hasSampleDataset: PropTypes.bool,
    engines: PropTypes.object,
    deletes: PropTypes.array,
    deletionError: PropTypes.object,
  };

  componentWillReceiveProps(newProps) {
    if (!this.props.created && newProps.created) {
      this.refs.createdDatabaseModal.open();
    }
  }

  render() {
    let {
      databases,
      hasSampleDataset,
      created,
      engines,
      deletionError,
    } = this.props;

    return (
      <div className="wrapper">
        <section className="PageHeader px2 clearfix">
          <Link
            to="/admin/databases/create"
            className="Button Button--primary float-right"
          >{t`Add database`}</Link>
          <h2 className="PageTitle">{t`Databases`}</h2>
        </section>
        {deletionError && (
          <section>
            <FormMessage formError={deletionError} />
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
                              ref={"deleteDatabaseModal_" + database.id}
                              triggerClasses="Button Button--danger"
                              triggerElement={t`Delete`}
                            >
                              <DeleteDatabaseModal
                                database={database}
                                onClose={() =>
                                  this.refs[
                                    "deleteDatabaseModal_" + database.id
                                  ].close()
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
                <a
                  className="text-light text-brand-hover no-decoration"
                  onClick={() => this.props.addSampleDataset()}
                >{t`Bring the sample dataset back`}</a>
              </span>
            </div>
          ) : null}
        </section>
        <ModalWithTrigger ref="createdDatabaseModal" isInitiallyOpen={created}>
          <CreatedDatabaseModal
            databaseId={parseInt(created)}
            onDone={() => this.refs.createdDatabaseModal.toggle()}
            onClose={() => this.refs.createdDatabaseModal.toggle()}
          />
        </ModalWithTrigger>
      </div>
    );
  }
}
