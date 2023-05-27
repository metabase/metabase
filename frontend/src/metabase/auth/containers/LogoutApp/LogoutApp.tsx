import { connect } from "react-redux";
import { logout } from "../../actions";
import Logout from "../../components/Logout";

const mapDispatchToProps = {
  onLogout: logout,
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(null, mapDispatchToProps)(Logout);
