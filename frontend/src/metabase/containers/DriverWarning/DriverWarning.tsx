import { connect } from "react-redux";
import DriverWarning from "metabase/components/DriverWarning";
import { State } from "metabase-types/store";

const mapStateToProps = (state: State) => ({
  engines: state.settings.values.engines,
});

export default connect(mapStateToProps)(DriverWarning);
