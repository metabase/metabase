import { connect } from "react-redux";
import { getUser } from "metabase/selectors/user";
import { PLUGIN_SELECTORS } from "metabase/plugins";
import { State } from "metabase-types/store";
import GreetingSection from "metabase/home/homepage/components/GreetingSection";

const mapStateToProps = (state: State) => ({
  user: getUser(state),
  showLogo: PLUGIN_SELECTORS.getShowBrandLogo(state),
});

export default connect(mapStateToProps)(GreetingSection);
