import { connect } from "react-redux";
import _ from "underscore";
import Pulses from "metabase/entities/pulses";
import AuditDeleteModal from "../components/AuditDeleteModal";

const mapStateToProps = (state, { pulse }) => ({
  item: pulse,
  type: "alert",
});

const mapDispatchToProps = {
  onSubmit: pulse => Pulses.actions.setArchived(pulse, true),
};

export default _.compose(
  Pulses.load({
    id: (state, props) => parseInt(props.params.pulseId),
  }),
  connect(
    mapStateToProps,
    mapDispatchToProps,
  ),
)(AuditDeleteModal);
