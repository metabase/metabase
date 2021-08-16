import { connect } from "react-redux";
import { getUser } from "metabase/selectors/user";
import UserProfile from "../components/UserProfile";

const mapStateToProps = state => ({
  user: getUser(state),
});

export default connect(mapStateToProps)(UserProfile);
