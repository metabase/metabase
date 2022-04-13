import { connect } from "react-redux";
import { push } from "react-router-redux";
import _ from "underscore";
import { t } from "ttag";
import Alerts from "metabase/entities/alerts";
import Users from "metabase/entities/users";
import { getUserIsAdmin } from "metabase/selectors/user";
import AuditNotificationEditModal from "../../components/AuditNotificationEditModal";

const mapStateToProps = (state, { alert }) => ({
  isAdmin: getUserIsAdmin(state),
  item: alert,
  type: "alert",
  invalidRecipientText: domains =>
    t`You're only allowed to email alerts to addresses ending in ${domains}`,
});

const mapDispatchToProps = {
  onUpdate: (alert, channels) => Alerts.actions.setChannels(alert, channels),
  onDelete: alert =>
    push(`/admin/audit/subscriptions/alerts/${alert.id}/delete`),
};

export default _.compose(
  Alerts.load({
    id: (state, props) => Number.parseInt(props.params.alertId),
  }),
  Users.loadList(),
  connect(mapStateToProps, mapDispatchToProps),
)(AuditNotificationEditModal);
