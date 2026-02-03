import _ from "underscore";

import { Pulses } from "metabase/entities/pulses";
import { connect } from "metabase/lib/redux";
import { getUser } from "metabase/selectors/user";

import ArchiveModal from "../../components/ArchiveModal";
import { getPulseId } from "../../selectors";

const mapStateToProps = (state, { pulse, location }) => ({
  item: pulse,
  type: "pulse",
  user: getUser(state),
  hasUnsubscribed: location.query.unsubscribed,
});

const mapDispatchToProps = {
  onArchive: Pulses.actions.setArchived,
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  Pulses.load({
    id: (state, props) => getPulseId(props),
  }),
  connect(mapStateToProps, mapDispatchToProps),
)(ArchiveModal);
