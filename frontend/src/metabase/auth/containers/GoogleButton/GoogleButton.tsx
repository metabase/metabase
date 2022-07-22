import { connect } from "react-redux";
import GoogleButton from "../../components/GoogleButton";
import { loginGoogle } from "../../actions";

const mapDispatchToProps = {
  onLogin: loginGoogle,
};

export default connect(null, mapDispatchToProps)(GoogleButton);
