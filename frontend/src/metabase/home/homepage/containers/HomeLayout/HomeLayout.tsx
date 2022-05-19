import { connect } from "react-redux";
import { PLUGIN_SELECTORS } from "metabase/plugins";
import { State } from "metabase-types/store";
import HomeLayout from "../../components/HomeLayout";

const mapStateToProps = (state: State) => ({
  showScene: !PLUGIN_SELECTORS.getHasCustomBranding(state),
});

export default connect(mapStateToProps)(HomeLayout);
