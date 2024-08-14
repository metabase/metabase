import { connect } from "react-redux";

import type { State } from "metabase-types/store";

import { updateSettings } from "../../actions";
import SlackStatus from "../../components/SlackStatus";
import SlackStatusForm from "../../containers/SlackStatusForm";
import { isSlackTokenValid } from "../../selectors";

const mapStateToProps = (state: State) => ({
  Form: SlackStatusForm,
  isValid: isSlackTokenValid(state),
});

const mapDispatchToProps = {
  onDelete: updateSettings,
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(mapStateToProps, mapDispatchToProps)(SlackStatus);
