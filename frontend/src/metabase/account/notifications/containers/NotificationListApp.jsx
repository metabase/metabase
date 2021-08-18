import { connect } from "react-redux";
import _ from "underscore";
import Alerts from "metabase/entities/alerts";
import Pulses from "metabase/entities/pulses";
import { getUser } from "metabase/selectors/user";
import { getGroups } from "../selectors";
import NotificationList from "../components/NotificationList";
import { push } from "react-router-redux";

const mapStateToProps = (state, props) => ({
  user: getUser(state),
  groups: getGroups(state, props),
});

const mapDispatchToProps = {
  onShowHelpModal: () => push("/account/notifications/help"),
};

export default _.compose(
  Alerts.loadList(),
  Pulses.loadList(),
  connect(
    mapStateToProps,
    mapDispatchToProps,
  ),
)(NotificationList);
