import _ from "underscore";

import LoadingAndGenericErrorWrapper from "metabase/components/LoadingAndGenericErrorWrapper";
import Database from "metabase/entities/databases";
import { connect } from "metabase/lib/redux";
import { isSyncInProgress } from "metabase/lib/syncing";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import { getSetting } from "metabase/selectors/settings";
import { getUserIsAdmin } from "metabase/selectors/user";

import DatabaseList from "../components/DatabaseList";
import {
  addSampleDatabase,
  closeSyncingModal,
  deleteDatabase,
} from "../database";
import {
  getAddSampleDatabaseError,
  getDeletes,
  getDeletionError,
  getIsAddingSampleDatabase,
} from "../selectors";

const RELOAD_INTERVAL = 2000;

const getReloadInterval = (_state, _props, databases = []) => {
  return databases.some(d => isSyncInProgress(d)) ? RELOAD_INTERVAL : 0;
};

const query = {
  ...PLUGIN_FEATURE_LEVEL_PERMISSIONS.databaseDetailsQueryProps,
};

const mapStateToProps = (state, props) => ({
  isAdmin: getUserIsAdmin(state),
  hasSampleDatabase: Database.selectors.getHasSampleDatabase(state, {
    entityQuery: query,
  }),
  isAddingSampleDatabase: getIsAddingSampleDatabase(state),
  addSampleDatabaseError: getAddSampleDatabaseError(state),

  created: props.location.query.created,
  createdDbId: props.location.query.createdDbId,
  engines: getSetting(state, "engines"),
  showSyncingModal: getSetting(state, "show-database-syncing-modal"),

  deletes: getDeletes(state),
  deletionError: getDeletionError(state),
});

const mapDispatchToProps = {
  // NOTE: still uses deleteDatabase from metabaseadmin/databases/databases.js
  // rather than metabase/entities/databases since it updates deletes/deletionError
  deleteDatabase: deleteDatabase,
  addSampleDatabase: addSampleDatabase,
  closeSyncingModal,
};

export default _.compose(
  Database.loadList({
    reloadInterval: getReloadInterval,
    query,
    LoadingAndErrorWrapper: LoadingAndGenericErrorWrapper,
  }),
  connect(mapStateToProps, mapDispatchToProps),
)(DatabaseList);
