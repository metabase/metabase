import { connect } from "react-redux";
import { push } from "react-router-redux";
import _ from "underscore";
import { t } from "ttag";
import Pulses from "metabase/entities/pulses";
import Users from "metabase/entities/users";
import { getUserIsAdmin } from "metabase/selectors/user";
import AuditNotificationEditModal from "../../components/AuditNotificationEditModal";

const mapStateToProps = (state, { pulse }) => ({
  isAdmin: getUserIsAdmin(state),
  item: pulse,
  type: "pulse",
  invalidRecipientText: domains =>
    t`You're only allowed to email subscriptions to addresses ending in ${domains}`,
});

const mapDispatchToProps = {
  onUpdate: (pulse, channels) => Pulses.actions.setChannels(pulse, channels),
  onDelete: alert =>
    push(`/admin/audit/subscriptions/subscriptions/${alert.id}/delete`),
};

export default _.compose(
  Pulses.load({
    id: (state, props) => Number.parseInt(props.params.pulseId),
  }),
  Users.loadList(),
  connect(mapStateToProps, mapDispatchToProps),
)(AuditNotificationEditModal);
