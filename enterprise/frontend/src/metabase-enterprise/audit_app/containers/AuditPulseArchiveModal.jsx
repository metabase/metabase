import { connect } from "react-redux";
import _ from "underscore";
import Pulses from "metabase/entities/pulses";
import AuditArchiveModal from "../components/AuditArchiveModal";

const mapStateToProps = (state, { pulse }) => ({
  item: pulse,
  type: "pulse",
});

const mapDispatchToProps = {
  onArchive: Pulses.actions.setArchived,
};

export default _.compose(
  Pulses.load({
    id: (state, props) => parseInt(props.params.pulseId),
  }),
  connect(
    mapStateToProps,
    mapDispatchToProps,
  ),
)(AuditArchiveModal);
