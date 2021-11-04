import { connect } from "react-redux";
import _ from "underscore";
import Databases from "metabase/entities/databases";
import SyncSnackbarSwitch from "../../components/SyncSnackbarSwitch";
import { getRefreshInterval, getUserDatabases } from "../../selectors";

export default _.compose(
  Databases.loadList({
    query: { include: "tables" },
    reloadInterval: getRefreshInterval,
  }),
  connect(state => ({
    databases: getUserDatabases(state),
  })),
)(SyncSnackbarSwitch);
