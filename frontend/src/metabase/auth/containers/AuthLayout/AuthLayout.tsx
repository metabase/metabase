import { connect } from "react-redux";
import { getSetting } from "metabase/selectors/settings";
import type { State } from "metabase-types/store";
import AuthLayout from "../../components/AuthLayout";

const mapStateToProps = (state: State) => ({
  showIllustration: getSetting(state, "show-lighthouse-illustration"),
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(mapStateToProps)(AuthLayout);
