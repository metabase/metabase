import { connect } from "react-redux";
import _ from "underscore";

import Pulses from "metabase/entities/pulses";

import AuditNotificationDeleteModal from "../../components/AuditNotificationDeleteModal";

const mapStateToProps = (state, { pulse }) => ({
  item: pulse,
  type: "alert",
});

const mapDispatchToProps = {
  onDelete: pulse => Pulses.actions.setArchived(pulse, true),
};

export default _.compose(
  Pulses.load({
    id: (state, props) => Number.parseInt(props.params.pulseId),
  }),
  connect(mapStateToProps, mapDispatchToProps),
)(AuditNotificationDeleteModal);
