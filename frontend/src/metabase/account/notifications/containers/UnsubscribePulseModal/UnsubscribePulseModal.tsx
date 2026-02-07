import _ from "underscore";

import type { Alert } from "metabase-types/api";
import type { State } from "metabase-types/store";

import { Pulses } from "metabase/entities/pulses";
import { connect } from "metabase/lib/redux";
import { getUser } from "metabase/selectors/user";

import { navigateToArchive } from "../../actions";
import UnsubscribeModal from "../../components/UnsubscribeModal";
import { getPulseId } from "../../selectors";

interface OwnProps {
  pulse: Alert;
  params: {
    pulseId?: string;
  };
}

const mapStateToProps = (state: State, { pulse }: OwnProps) => ({
  item: pulse,
  type: "pulse",
  user: getUser(state),
});

const mapDispatchToProps = {
  onUnsubscribe: Pulses.actions.unsubscribe,
  onArchive: navigateToArchive,
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  Pulses.load({
    id: (state: State, props: OwnProps) => getPulseId(props),
  }),
  connect(mapStateToProps, mapDispatchToProps),
)(UnsubscribeModal);
