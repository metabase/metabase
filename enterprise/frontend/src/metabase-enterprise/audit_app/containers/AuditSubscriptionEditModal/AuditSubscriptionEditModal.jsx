import { connect } from "react-redux";
import { push } from "react-router-redux";
import _ from "underscore";
import Pulses from "metabase/entities/pulses";
import Users from "metabase/entities/users";
import AuditNotificationEditModal from "../../components/AuditNotificationEditModal";

const mapStateToProps = (state, { pulse }) => ({
  item: pulse,
  type: "pulse",
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
  connect(
    mapStateToProps,
    mapDispatchToProps,
  ),
)(AuditNotificationEditModal);
