import { connect } from "react-redux";
import { getUserIsAdmin } from "metabase/selectors/user";
import { State } from "metabase-types/store";
import StatusListing from "../../components/StatusListing";

const mapStateToProps = (state: State) => ({
  isAdmin: getUserIsAdmin(state),
});

export default connect(mapStateToProps)(StatusListing);
