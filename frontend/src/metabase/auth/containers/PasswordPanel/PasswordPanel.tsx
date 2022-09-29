import { connect } from "react-redux";
import { getExternalAuthProviders } from "metabase/auth/selectors";
import { login } from "../../actions";
import PasswordPanel from "../../components/PasswordPanel";

const mapStateToProps = (state: any) => ({
  providers: getExternalAuthProviders(state),
});

const mapDispatchToProps = {
  onLogin: login,
};

export default connect(mapStateToProps, mapDispatchToProps)(PasswordPanel);
