import { connect } from "react-redux";
import { getUser } from "metabase/selectors/user";
import SyncProgress from "../../components/SyncProgress";
import { getDatabases, showXrays, showModal } from "../../selectors";

const mapStateToProps = (state: any) => ({
  user: getUser(state),
  databases: getDatabases(state),
  showXrays: showXrays(state),
  showModal: showModal(state),
});

export default connect(mapStateToProps)(SyncProgress);
