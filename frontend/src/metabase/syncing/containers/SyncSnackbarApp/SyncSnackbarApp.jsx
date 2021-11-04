import { connect } from "react-redux";
import _ from "underscore";
import Databases from "metabase/entities/databases";
import SyncSnackbarSwitch from "../../components/SyncSnackbarSwitch";
import { getRefreshInterval, getUserDatabases } from "../../selectors";

const mapStateToProps = state => ({
  databases: getUserDatabases(state),
});

export default _.compose(
  Databases.loadList({
    refreshInterval: getRefreshInterval,
  }),
  connect(mapStateToProps),
)(SyncSnackbarSwitch);
