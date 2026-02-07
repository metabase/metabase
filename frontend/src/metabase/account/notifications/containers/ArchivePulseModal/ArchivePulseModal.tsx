import _ from "underscore";

import type { Alert } from "metabase-types/api";
import type { State } from "metabase-types/store";

import { Pulses } from "metabase/entities/pulses";
import { connect } from "metabase/lib/redux";
import { getUser } from "metabase/selectors/user";

import ArchiveModal from "../../components/ArchiveModal";
import { getPulseId } from "../../selectors";

interface OwnProps {
  pulse: Alert;
  location: {
    query: {
      unsubscribed?: string;
    };
  };
}

const mapStateToProps = (state: State, { pulse, location }: OwnProps) => ({
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
    id: (state: State, props: OwnProps) => getPulseId(props),
  }),
  connect(mapStateToProps, mapDispatchToProps),
)(ArchiveModal);
