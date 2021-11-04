import { connect } from "react-redux";
import _ from "underscore";
import Databases from "metabase/entities/databases";
import SyncModalSwitch from "../../components/SyncModalSwitch";
import { hasSyncingDatabases } from "../../selectors";

const listOptions = {
  query: { include: "tables" },
};

const mapStateToProps = state => ({
  isSyncing: hasSyncingDatabases(state),
  isInitialSync: true,
});

export default _.compose(
  Databases.loadList(listOptions),
  connect(mapStateToProps),
)(SyncModalSwitch);
