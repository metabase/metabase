import { connect } from "react-redux";
import Login from "../../components/Login";
import { getProviders } from "../../selectors";

const mapStateToProps = (state: any, props: any) => ({
  providers: getProviders(state, props),
  providerName: props.params.provider,
  redirectUrl: props.location.query.redirect,
});

export default connect(mapStateToProps)(Login);
