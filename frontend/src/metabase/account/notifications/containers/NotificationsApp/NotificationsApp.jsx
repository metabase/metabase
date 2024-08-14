import { connect } from "react-redux";
import _ from "underscore";

import Alerts from "metabase/entities/alerts";
import Pulses from "metabase/entities/pulses";
import {
  getUser,
  getUserId,
  canManageSubscriptions,
} from "metabase/selectors/user";

import {
  navigateToArchive,
  navigateToHelp,
  navigateToUnsubscribe,
} from "../../actions";
import NotificationList from "../../components/NotificationList";
import { getNotifications } from "../../selectors";

const mapStateToProps = (state, props) => ({
  user: getUser(state),
  items: getNotifications(props),
  canManageSubscriptions: canManageSubscriptions(state),
});

const mapDispatchToProps = {
  onHelp: navigateToHelp,
  onUnsubscribe: navigateToUnsubscribe,
  onArchive: navigateToArchive,
};

export default _.compose(
  Alerts.loadList({
    query: state => ({ user_id: getUserId(state) }),
    reload: true,
  }),
  Pulses.loadList({
    // Load all pulses the current user is a creator or recipient of
    query: state => ({ creator_or_recipient: true }),
    reload: true,
  }),
  connect(mapStateToProps, mapDispatchToProps),
)(NotificationList);
