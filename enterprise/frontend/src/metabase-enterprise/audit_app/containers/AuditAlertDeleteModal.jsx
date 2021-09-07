import { connect } from "react-redux";
import _ from "underscore";
import Alerts from "metabase/entities/alerts";
import AuditDeleteModal from "../components/AuditDeleteModal";

const mapStateToProps = (state, { alert }) => ({
  item: alert,
  type: "alert",
});

const mapDispatchToProps = {
  onSubmit: alert => Alerts.actions.setArchived(alert, true),
};

export default _.compose(
  Alerts.load({
    id: (state, props) => parseInt(props.params.alertId),
  }),
  connect(
    mapStateToProps,
    mapDispatchToProps,
  ),
)(AuditDeleteModal);
