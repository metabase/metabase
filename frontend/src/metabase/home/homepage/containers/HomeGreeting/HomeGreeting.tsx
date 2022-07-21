import { connect } from "react-redux";
import { getUser } from "metabase/selectors/user";
import { State } from "metabase-types/store";
import HomeGreeting from "../../components/HomeGreeting";

const mapStateToProps = (state: State) => ({
  user: getUser(state),
  showLogo: state.settings.values["show-metabot"] ?? true,
});

export default connect(mapStateToProps)(HomeGreeting);
