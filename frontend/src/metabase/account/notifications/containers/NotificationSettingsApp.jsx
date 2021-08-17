import { connect } from "react-redux";
import _ from "underscore";
import { getUser } from "metabase/selectors/user";
import NotificationSettings from "../components/NotificationSettings";
import Pulses from "metabase/entities/pulses";

const mapStateToProps = state => ({
  user: getUser(state),
});

export default _.compose(
  Pulses.loadList({ query: () => ({ dashboard_id: 6 }) }),
  connect(mapStateToProps),
)(NotificationSettings);
