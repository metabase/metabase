import { connect } from "react-redux";
import _ from "underscore";
import Pulses from "metabase/entities/pulses";
import { getUser, getUserId } from "metabase/selectors/user";
import { navigateToArchive } from "../actions";
import { getPulse } from "../selectors";
import UnsubscribeModal from "../components/UnsubscribeModal";

const mapStateToProps = (state, props) => ({
  item: getPulse(props),
  type: "pulse",
  user: getUser(state),
});

const mapDispatchToProps = {
  onUnsubscribe: Pulses.actions.unsubscribe,
  onArchive: navigateToArchive,
};

export default _.compose(
  Pulses.loadList({
    query: state => ({ user_id: getUserId(state) }),
  }),
  connect(
    mapStateToProps,
    mapDispatchToProps,
  ),
)(UnsubscribeModal);
