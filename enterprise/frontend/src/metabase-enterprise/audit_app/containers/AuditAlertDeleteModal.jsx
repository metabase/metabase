import { connect } from "react-redux";
import _ from "underscore";
import { t } from "ttag";
import Alerts from "metabase/entities/alerts";
import AuditDeleteModal from "../components/AuditDeleteModal";
import { formatChannels } from "metabase/lib/notifications";

const mapStateToProps = (state, { alert }) => ({
  item: alert,
  title: t`Delete this alert?`,
  description: t`This alert will no longer be ${formatChannels(
    alert.channels,
  )}.`,
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
