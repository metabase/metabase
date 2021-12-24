import { connect } from "react-redux";
import { PLUGIN_SELECTORS } from "metabase/plugins";
import AuthScene from "../../components/AuthScene/AuthScene";

const mapStateToProps = (state: unknown, props: unknown) => ({
  showAuthScene: PLUGIN_SELECTORS.getShowAuthScene(state, props),
});

export default connect(mapStateToProps)(AuthScene);
