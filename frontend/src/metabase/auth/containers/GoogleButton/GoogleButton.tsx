import { connect } from "react-redux";
import { State } from "metabase-types/store";
import GoogleButton from "../../components/GoogleButton";
import { loginGoogle } from "../../actions";

const mapStateToProps = (state: State) => ({
  clientId: state.settings.values["google-auth-client-id"],
  locale: state.settings.values["site-locale"],
});

const mapDispatchToProps = {
  onLogin: loginGoogle,
};

export default connect(mapStateToProps, mapDispatchToProps)(GoogleButton);
