import { connect } from "react-redux";
import _ from "underscore";
import Databases from "metabase/entities/databases";
import { getReloadInterval, getUserDatabases } from "../../selectors";
import SyncSnackbar from "../../components/SyncSnackbar";

export default _.compose(
  Databases.loadList({
    query: { include: "tables" },
    reloadInterval: getReloadInterval,
  }),
  connect(state => ({
    databases: getUserDatabases(state),
  })),
)(SyncSnackbar);
