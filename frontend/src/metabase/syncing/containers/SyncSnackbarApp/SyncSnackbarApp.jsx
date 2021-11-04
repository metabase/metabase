import { connect } from "react-redux";
import _ from "underscore";
import Databases from "metabase/entities/databases";
import SyncSnackbarSwitch from "../../components/SyncSnackbarSwitch";
import { getRefreshInterval, getUserDatabases } from "../../selectors";

const mapStateToProps = (state, props) => ({
  databases: getUserDatabases(props),
});

export default _.compose(
  Databases.loadList({
    query: { include: "tables" },
    refreshInterval: (state, props) => getRefreshInterval(props),
  }),
  connect(mapStateToProps),
)(SyncSnackbarSwitch);
