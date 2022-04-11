import { connect } from "react-redux";
import { attachGoogleAuth } from "metabase/lib/auth";
import GoogleButton from "../../components/GoogleButton";
import { loginGoogle } from "../../actions";

const mapStateToProps = () => ({
  onAttach: attachGoogleAuth,
});

const mapDispatchToProps = {
  onLogin: loginGoogle,
};

export default connect(mapStateToProps, mapDispatchToProps)(GoogleButton);
