import { connect } from "react-redux";
import _ from "underscore";
import Databases from "metabase/entities/databases";
import SyncSnackbarSwitch from "../../components/SyncSnackbarSwitch";
import { getRefreshInterval, getUserDatabases } from "../../selectors";

const listOptions = {
  query: { include: "tables" },
  reloadInterval: getRefreshInterval,
};

const mapStateToProps = state => ({
  databases: getUserDatabases(state),
});

export default _.compose(
  Databases.loadList(listOptions),
  connect(mapStateToProps),
)(SyncSnackbarSwitch);
