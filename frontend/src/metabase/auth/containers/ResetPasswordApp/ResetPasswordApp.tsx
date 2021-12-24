import { connect } from "react-redux";
import { PLUGIN_SELECTORS } from "metabase/plugins";
import ResetPassword from "../../components/ResetPassword";

const mapStateToProps = (state: any, props: any) => ({
  showScene: PLUGIN_SELECTORS.getShowAuthScene(state, props),
});

export default connect(mapStateToProps)(ResetPassword);
