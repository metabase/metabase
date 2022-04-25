import { connect } from "react-redux";
import { getUser } from "metabase/selectors/user";
import { PLUGIN_SELECTORS } from "metabase/plugins";
import { State } from "metabase-types/store";
import HomeGreeting from "../../components/HomeGreeting";

const mapStateToProps = (state: State) => ({
  user: getUser(state),
  showLogo: !PLUGIN_SELECTORS.getHasCustomBranding(state),
});

export default connect(mapStateToProps)(HomeGreeting);
