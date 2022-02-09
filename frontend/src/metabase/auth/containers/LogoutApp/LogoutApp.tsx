import { connect } from "react-redux";
import { logout } from "../../actions";
import Logout from "../../components/Logout";

const mapDispatchToProps = {
  onLogout: logout,
};

export default connect(null, mapDispatchToProps)(Logout);
