import { connect } from "react-redux";
import _ from "underscore";
import Databases from "metabase/entities/databases";
import SyncSnackbarSwitch from "../../components/SyncSnackbarSwitch";
import { getRefreshInterval, getUserDatabases } from "../../selectors";

export default _.compose(
  Databases.loadList({
    query: { include: "tables" },
    refreshInterval: (state, props) => getRefreshInterval(props),
  }),
  connect((state, props) => ({
    databases: getUserDatabases(props),
  })),
)(SyncSnackbarSwitch);
