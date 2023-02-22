import { connect } from "react-redux";
import { getSetting } from "metabase/selectors/settings";
import type { State } from "metabase-types/store";
import AuthLayout from "../../components/AuthLayout";

const mapStateToProps = (state: State) => ({
  showIllustration: getSetting(state, "show-lighthouse-illustration"),
});

export default connect(mapStateToProps)(AuthLayout);
