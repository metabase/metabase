import { connect } from "react-redux";
import _ from "underscore";

import Pulses from "metabase/entities/pulses";
import { getUser } from "metabase/selectors/user";

import { navigateToArchive } from "../../actions";
import UnsubscribeModal from "../../components/UnsubscribeModal";
import { getPulseId } from "../../selectors";

const mapStateToProps = (state, { pulse }) => ({
  item: pulse,
  type: "pulse",
  user: getUser(state),
});

const mapDispatchToProps = {
  onUnsubscribe: Pulses.actions.unsubscribe,
  onArchive: navigateToArchive,
};

export default _.compose(
  Pulses.load({
    id: (state, props) => getPulseId(props),
  }),
  connect(mapStateToProps, mapDispatchToProps),
)(UnsubscribeModal);
