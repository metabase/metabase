import { connect } from "react-redux";
import _ from "underscore";
import Pulses from "metabase/entities/pulses";
import { getUserId } from "metabase/selectors/user";
import { getPulse } from "../selectors";
import ArchiveModal from "../components/ArchiveModal";

const mapStateToProps = (state, props) => ({
  item: getPulse(props),
  type: "pulse",
});

const mapDispatchToProps = {
  onArchive: Pulses.actions.setArchived,
};

export default _.compose(
  Pulses.loadList({
    query: state => ({ user_id: getUserId(state) }),
  }),
  connect(
    mapStateToProps,
    mapDispatchToProps,
  ),
)(ArchiveModal);
