import { connect } from "react-redux";
import { PLUGIN_SELECTORS } from "metabase/plugins";
import AuthLayout from "../../components/AuthLayout";
import { State } from "metabase-types/store";

const mapStateToProps = (state: State) => ({
  showScene: !PLUGIN_SELECTORS.getHasCustomBranding(state),
});

export default connect(mapStateToProps)(AuthLayout);
