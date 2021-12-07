import { connect } from "react-redux";
import _ from "underscore";
import Databases from "metabase/entities/databases";
import { getUser } from "metabase/selectors/user";
import SyncProgress from "../../components/SyncProgress";
import { getDatabases, showXrays, showModal } from "../../selectors";

const databasesProps = {
  loadingAndErrorWrapper: false,
};

const mapStateToProps = (state: any) => ({
  user: getUser(state),
  databases: getDatabases(state),
  showXrays: showXrays(state),
  showModal: showModal(state),
});

export default _.compose(
  Databases.loadList(databasesProps),
  connect(mapStateToProps),
)(SyncProgress);
