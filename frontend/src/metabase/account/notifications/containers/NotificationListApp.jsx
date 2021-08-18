import { connect } from "react-redux";
import _ from "underscore";
import Pulses from "metabase/entities/pulses";
import { getUser } from "metabase/selectors/user";
import { getGroups } from "../selectors";
import NotificationList from "../components/NotificationList";

const mapStateToProps = (state, props) => ({
  user: getUser(state),
  groups: getGroups(state, props),
});

export default _.compose(
  Pulses.loadList({ query: () => ({ dashboard_id: 6 }) }),
  connect(mapStateToProps),
)(NotificationList);
