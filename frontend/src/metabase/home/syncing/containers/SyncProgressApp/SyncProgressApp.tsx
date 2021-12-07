import { connect } from "react-redux";
import _ from "underscore";
import { getUserIsAdmin } from "metabase/selectors/user";
import SyncProgress from "../../components/SyncProgress";

export default _.compose(
  connect(state => ({ isAdmin: getUserIsAdmin(state) })),
)(SyncProgress);
