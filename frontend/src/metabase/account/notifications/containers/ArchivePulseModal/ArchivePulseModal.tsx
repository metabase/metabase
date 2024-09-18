import { connect } from "react-redux";
import _ from "underscore";
import type { Location } from "history";

import Pulses from "metabase/entities/pulses";
import { getUser } from "metabase/selectors/user";

import ArchiveModal from "../../components/ArchiveModal";
import { getPulseId } from "../../selectors";
import { State } from "metabase-types/store";
import { Pulse } from "metabase-types/api";

const mapStateToProps = (
  state: State,
  { pulse, location }: { pulse: Pulse; location: Location },
) => ({
  item: pulse,
  type: "pulse",
  user: getUser(state),
  hasUnsubscribed: location.query.unsubscribed,
});

const mapDispatchToProps = {
  onArchive: Pulses.actions.setArchived,
};

export default _.compose(
  Pulses.load({
    id: (_state: State, props: { params: { pulseId: string } }) =>
      getPulseId(props),
  }),
  connect(mapStateToProps, mapDispatchToProps),
)(ArchiveModal);
