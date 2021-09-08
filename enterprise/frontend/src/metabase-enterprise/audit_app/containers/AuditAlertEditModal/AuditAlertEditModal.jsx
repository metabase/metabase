import { connect } from "react-redux";
import _ from "underscore";
import Alerts from "metabase/entities/alerts";
import Users from "metabase/entities/users";
import AuditNotificationEditModal from "../../components/AuditNotificationEditModal";

const mapStateToProps = (state, { alert }) => ({
  item: alert,
  type: "alert",
});

const mapDispatchToProps = {
  onUpdate: (alert, channels) => Alerts.actions.setChannels(alert, channels),
};

export default _.compose(
  Alerts.load({
    id: (state, props) => Number.parseInt(props.params.alertId),
  }),
  Users.loadList(),
  connect(
    mapStateToProps,
    mapDispatchToProps,
  ),
)(AuditNotificationEditModal);
