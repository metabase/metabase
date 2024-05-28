import { connect } from "react-redux";

import type { State } from "metabase-types/store";

import SlackStatusForm from "../../components/SlackStatusForm";
import { getSlackSettings } from "../../selectors";

const mapStateToProps = (state: State) => ({
  settings: getSlackSettings(state),
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(mapStateToProps)(SlackStatusForm);
