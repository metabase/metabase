import { connect } from "react-redux";
import { push } from "react-router-redux";
import _ from "underscore";
import Alerts from "metabase/entities/alerts";
import Pulses from "metabase/entities/pulses";
import { getUser, getUserId } from "metabase/selectors/user";
import { getNotifications } from "../selectors";
import NotificationList from "../components/NotificationList";

const mapStateToProps = (state, props) => ({
  user: getUser(state),
  items: getNotifications(props),
});

const mapDispatchToProps = {
  onShowHelp: () => push("/account/notifications/help"),
};

export default _.compose(
  Alerts.loadList({
    query: state => ({ user_id: getUserId(state) }),
  }),
  Pulses.loadList({
    query: state => ({ user_id: getUserId(state) }),
  }),
  connect(
    mapStateToProps,
    mapDispatchToProps,
  ),
)(NotificationList);
