import { connect } from "react-redux";
import _ from "underscore";
import { t } from "ttag";
import Pulses from "metabase/entities/pulses";
import AuditDeleteModal from "../components/AuditDeleteModal";
import { formatChannels } from "metabase/lib/notifications";

const mapStateToProps = (state, { pulse }) => ({
  item: pulse,
  title: t`Delete this subscription to ${pulse.name}?`,
  description: t`This subscription will no longer be ${formatChannels(
    pulse.channels,
  )}.`,
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
