import { connect } from "react-redux";
import Login from "../../components/Login";
import { getAuthProviders } from "../../selectors";

const mapStateToProps = (state: any, props: any) => ({
  providers: getAuthProviders(state),
  providerName: props.params.provider,
  redirectUrl: props.location.query.redirect,
});

export default connect(mapStateToProps)(Login);
