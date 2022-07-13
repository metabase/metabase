import { connect } from "react-redux";
import AuthLayout from "../../components/AuthLayout";
import { State } from "metabase-types/store";

const mapStateToProps = (state: State) => ({
  showIllustration:
    state.settings.values["show-lighthouse-illustration"] ?? true,
});

export default connect(mapStateToProps)(AuthLayout);
