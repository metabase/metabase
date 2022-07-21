import { connect } from "react-redux";
import { State } from "metabase-types/store";
import HomeLayout from "../../components/HomeLayout";

const mapStateToProps = (state: State) => ({
  showIllustration:
    state.settings.values["show-lighthouse-illustration"] ?? true,
});

export default connect(mapStateToProps)(HomeLayout);
