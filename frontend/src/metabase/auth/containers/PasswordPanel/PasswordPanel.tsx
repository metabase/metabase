import { connect } from "react-redux";
import { login } from "../../actions";
import PasswordPanel from "../../components/PasswordPanel";

const mapDispatchToProps = {
  onLogin: login,
};

export default connect(null, mapDispatchToProps)(PasswordPanel);
