import { connect } from "react-redux";
import { State } from "metabase-types/store";
import AuthLayout from "../../components/AuthLayout";

const mapStateToProps = (state: State) => ({
  showIllustration: state.settings.values["show-lighthouse-illustration"],
});

export default connect(mapStateToProps)(AuthLayout);
