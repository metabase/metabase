import { connect } from "react-redux";
import _ from "underscore";

import Alerts from "metabase/entities/alerts";

import AuditNotificationDeleteModal from "../../components/AuditNotificationDeleteModal";

const mapStateToProps = (state, { alert }) => ({
  item: alert,
  type: "alert",
});

const mapDispatchToProps = {
  onDelete: alert => Alerts.actions.setArchived(alert, true),
};

export default _.compose(
  Alerts.load({
    id: (state, props) => Number.parseInt(props.params.alertId),
  }),
  connect(mapStateToProps, mapDispatchToProps),
)(AuditNotificationDeleteModal);
