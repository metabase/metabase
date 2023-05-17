import { connect } from "react-redux";
import { getSetting } from "metabase/selectors/settings";
import type { State } from "metabase-types/store";
import GoogleButton from "../../components/GoogleButton";
import { loginGoogle } from "../../actions";

const mapStateToProps = (state: State) => ({
  clientId: getSetting(state, "google-auth-client-id"),
  locale: getSetting(state, "site-locale"),
});

const mapDispatchToProps = {
  onLogin: loginGoogle,
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(mapStateToProps, mapDispatchToProps)(GoogleButton);
