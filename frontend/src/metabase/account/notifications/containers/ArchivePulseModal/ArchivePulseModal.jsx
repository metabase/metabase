import { connect } from "react-redux";
import _ from "underscore";
import Pulses from "metabase/entities/pulses";
import { getPulseId } from "../../selectors";
import ArchiveModal from "../../components/ArchiveModal";

const mapStateToProps = (state, { pulse }) => ({
  item: pulse,
  type: "pulse",
});

const mapDispatchToProps = {
  onArchive: Pulses.actions.setArchived,
};

export default _.compose(
  Pulses.load({
    id: (state, props) => getPulseId(props),
  }),
  connect(
    mapStateToProps,
    mapDispatchToProps,
  ),
)(ArchiveModal);
