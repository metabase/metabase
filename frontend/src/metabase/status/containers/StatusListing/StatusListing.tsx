import { connect } from "react-redux";
import { getUserIsAdmin } from "metabase/selectors/user";
import StatusListing from "../../components/StatusListing";

const mapStateToProps = (state: any) => ({
  isAdmin: getUserIsAdmin(state),
});

export default connect(mapStateToProps)(StatusListing);
