import { connect } from "react-redux";
import _ from "underscore";
import Alerts from "metabase/entities/alerts";
import AuditArchiveModal from "../components/AuditArchiveModal";

const mapStateToProps = (state, { alert }) => ({
  item: alert,
  type: "alert",
});

const mapDispatchToProps = {
  onArchive: Alerts.actions.setArchived,
};

export default _.compose(
  Alerts.load({
    id: (state, props) => parseInt(props.params.alertId),
  }),
  connect(
    mapStateToProps,
    mapDispatchToProps,
  ),
)(AuditArchiveModal);
