import type { Location } from "history";
import { connect } from "react-redux";
import _ from "underscore";

import Pulses from "metabase/entities/pulses";
import { getUser } from "metabase/selectors/user";
import type { Pulse } from "metabase-types/api";
import type { State } from "metabase-types/store";

import ArchiveModal from "../../components/ArchiveModal";
import { getPulseId } from "../../selectors";

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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  Pulses.load({
    id: (_state: State, props: { params: { pulseId: string } }) =>
      getPulseId(props),
  }),
  connect(mapStateToProps, mapDispatchToProps),
)(ArchiveModal);
